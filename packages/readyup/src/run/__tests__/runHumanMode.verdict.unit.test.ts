import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RdyReport } from '../../kits/types.ts';
import type { SummaryRow } from '../../layout/layoutEngine.ts';
import type { RunRdyOptions } from '../runRdy.ts';

const mockLoadRdyKit = vi.hoisted(() => vi.fn());
const mockRunRdy = vi.hoisted(() => vi.fn<(checklist: unknown, options?: RunRdyOptions) => Promise<RdyReport>>());
const mockReportRdy = vi.hoisted(() => vi.fn());
const mockFormatCombinedSummary = vi.hoisted(() => vi.fn<(rows: SummaryRow[]) => string>());
const mockResolveGitHubToken = vi.hoisted(() => vi.fn());
const mockLoadRemoteKit = vi.hoisted(() => vi.fn());
const mockReadManifestTracking = vi.hoisted(() => vi.fn());
const mockWarnOnKitStaleness = vi.hoisted(() => vi.fn());
const mockWarnOnUnusedPragmas = vi.hoisted(() => vi.fn());
const mockWarnOnUnmarkedGeneratedSources = vi.hoisted(() => vi.fn());

vi.mock(import('../../kits/loadRdyKit.ts'), () => ({
  loadRdyKit: mockLoadRdyKit,
}));

vi.mock(import('../runRdy.ts'), () => ({
  runRdy: mockRunRdy,
}));

vi.mock(import('../../reporting/reportRdy.ts'), async () => {
  const actual = await vi.importActual<typeof import('../../reporting/reportRdy.ts')>('../../reporting/reportRdy.ts');
  return {
    ...actual,
    reportRdy: mockReportRdy,
  };
});

vi.mock(import('../../reporting/formatCombinedSummary.ts'), () => ({
  formatCombinedSummary: mockFormatCombinedSummary,
}));

vi.mock(import('../../remote/resolveGitHubToken.ts'), () => ({
  resolveGitHubToken: mockResolveGitHubToken,
}));

vi.mock(import('../../remote/loadRemoteKit.ts'), () => ({
  loadRemoteKit: mockLoadRemoteKit,
}));

// Mocked so that no case reads the repo's own manifest or hashes files on disk. `loadKit.ts` stays real, and the
// rendering cases assert on its errors.
vi.mock(import('../kit-staleness.ts'), () => ({
  readManifestTracking: mockReadManifestTracking,
  warnOnKitStaleness: mockWarnOnKitStaleness,
}));

// Mocked so that no case reads the sources named by the ledger; what the report itself writes is covered by its
// own tests.
vi.mock(import('../pragma-report.ts'), () => ({
  warnOnUnusedPragmas: mockWarnOnUnusedPragmas,
}));

// Mocked for the same reason as the pragma report.
vi.mock(import('../generated-report.ts'), () => ({
  warnOnUnmarkedGeneratedSources: mockWarnOnUnmarkedGeneratedSources,
}));

import { runHumanMode } from '../runHumanMode.ts';
import { makeKit, singleKitEntry } from '../test-utils/kit-fixtures.ts';
import { makeFailedResult, makePassedResult, makeSkippedResult } from '../test-utils/result-fixtures.ts';
import { runHuman } from '../test-utils/runHuman.ts';

describe(runHumanMode, () => {
  beforeEach(() => {
    mockReportRdy.mockReturnValue({ body: 'report output', hasVisibleResults: true });
    mockFormatCombinedSummary.mockReturnValue('combined summary');
    mockReadManifestTracking.mockReturnValue({ tracking: undefined, warnings: [] });
    mockWarnOnKitStaleness.mockReturnValue([]);
    mockWarnOnUnusedPragmas.mockReturnValue([]);
    mockWarnOnUnmarkedGeneratedSources.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockLoadRdyKit.mockReset();
    mockRunRdy.mockReset();
    mockReportRdy.mockReset();
    mockFormatCombinedSummary.mockReset();
    mockResolveGitHubToken.mockReset();
    mockLoadRemoteKit.mockReset();
    mockReadManifestTracking.mockReset();
    mockWarnOnKitStaleness.mockReset();
    mockWarnOnUnusedPragmas.mockReset();
    mockWarnOnUnmarkedGeneratedSources.mockReset();
  });

  describe('resolved thresholds', () => {
    it('passes failOn to runRdy', async () => {
      const kit = makeKit({ failOn: 'recommend' });
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runHuman(singleKitEntry(['deploy']));

      expect(mockRunRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ failOn: 'recommend' }));
    });

    it('passes reportOn to reportRdy', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runHuman(singleKitEntry(['deploy']), { reportOn: 'warn' });

      expect(mockReportRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reportOn: 'warn' }));
    });
  });

  describe('closing verdict', () => {
    it('ends a passing run with the verdict and the threshold that governed it', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      const { stdout } = await runHuman(singleKitEntry(['deploy']));

      expect(stdout).toMatch(/report output\n\n.*Run passed \(fail-on: error\)\n$/);
    });

    // Under `--fail-on recommend`, the report of a run failing on a recommendation reads like one that passes.
    it('ends a run that fails on a recommendation with a failed verdict', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({
        results: [makeFailedResult('lint', 'recommend')],
        passed: false,
        durationMs: 0,
      });

      const { exitCode, stdout } = await runHuman(singleKitEntry(['deploy']), { failOn: 'recommend' });

      expect(exitCode).toBe(1);
      expect(lastLine(stdout)).toContain('Run failed (fail-on: recommend)');
    });

    it('names each kit with its threshold when the kits resolve different thresholds', async () => {
      mockLoadRdyKit
        .mockResolvedValueOnce({ kit: makeKit({ failOn: 'warn' }), compileTimeVersion: undefined })
        .mockResolvedValueOnce({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      const { stdout } = await runHuman([
        { name: 'audit', source: { path: '.readyup/kits/audit.js' }, checklists: ['deploy'] },
        { name: 'release', source: { path: '.readyup/kits/release.js' }, checklists: ['deploy'] },
      ]);

      expect(lastLine(stdout)).toContain('Run passed (fail-on: error for release; warn for audit)');
    });

    it('ends a run in which a kit did not load with an incomplete verdict', async () => {
      mockLoadRdyKit
        .mockRejectedValueOnce(new Error('Kit not found'))
        .mockResolvedValueOnce({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      const { stdout } = await runHuman([
        { name: 'broken', source: { path: '.readyup/kits/broken.js' }, checklists: ['deploy'] },
        { name: 'healthy', source: { path: '.readyup/kits/healthy.js' }, checklists: ['deploy'] },
      ]);

      expect(lastLine(stdout)).toContain('Run incomplete: 1 kit did not run');
    });

    it('says that a failing check is withheld when the reporting threshold is above the failure threshold', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({
        results: [makePassedResult('build', 'error'), makeFailedResult('lint', 'recommend')],
        passed: false,
        durationMs: 0,
      });

      const { stdout } = await runHuman(singleKitEntry(['deploy']), { failOn: 'recommend', reportOn: 'warn' });

      expect(stdout).toContain('Hint: 1 failing check is not shown; rerun with --report-on recommend to show it\n');
    });

    it('does not count a failing check shown as the ancestor of a visible check', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({
        results: [makeFailedResult('lint', 'recommend'), makeSkippedResult('format', 'error', 1)],
        passed: false,
        durationMs: 0,
      });

      const { stdout } = await runHuman(singleKitEntry(['deploy']), { failOn: 'recommend', reportOn: 'warn' });

      expect(stdout).not.toContain('not shown');
    });

    it('does not count a withheld failure that does not fail the run', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({
        results: [makeFailedResult('lint', 'recommend')],
        passed: true,
        durationMs: 0,
      });

      const { stdout } = await runHuman(singleKitEntry(['deploy']), { reportOn: 'warn' });

      expect(stdout).not.toContain('not shown');
    });
  });
});

// region | Helpers

/** Returns the last line of `stdout`, ignoring its trailing newline. */
function lastLine(stdout: string): string | undefined {
  return stdout.trimEnd().split('\n').at(-1);
}

// endregion | Helpers
