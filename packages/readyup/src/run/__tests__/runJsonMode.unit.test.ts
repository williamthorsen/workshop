import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import type { Severity } from '../../kits/types.ts';
import { RemoteFetchError } from '../../remote/RemoteFetchError.ts';
import type { JsonDetail } from '../../schemas/reportSchema.ts';
import type { ResolvedKitEntry } from '../ResolvedKitEntry.ts';

const mockLoadRdyKit = vi.hoisted(() => vi.fn());
const mockRunRdy = vi.hoisted(() => vi.fn());
const mockFormatJsonReport = vi.hoisted(() => vi.fn());
const mockReportRdy = vi.hoisted(() => vi.fn());
const mockFormatCombinedSummary = vi.hoisted(() => vi.fn());
const mockResolveGitHubToken = vi.hoisted(() => vi.fn());
const mockLoadRemoteKit = vi.hoisted(() => vi.fn());
const mockReadManifestTracking = vi.hoisted(() => vi.fn());
const mockWarnOnKitStaleness = vi.hoisted(() => vi.fn());

vi.mock(import('../../kits/loadRdyKit.ts'), () => ({
  loadRdyKit: mockLoadRdyKit,
}));

vi.mock(import('../runRdy.ts'), () => ({
  runRdy: mockRunRdy,
}));

vi.mock(import('../../reporting/formatJsonReport.ts'), () => ({
  formatJsonReport: mockFormatJsonReport,
}));

// The two human-mode renderers below are mocked only to give the case asserting that no human output
// appears something to watch.
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

// Mocked so no case reads the repo's own manifest or hashes files on disk. `loadKit.ts` stays real, its
// errors being what the kit-load cases assert.
vi.mock(import('../kit-staleness.ts'), () => ({
  readManifestTracking: mockReadManifestTracking,
  warnOnKitStaleness: mockWarnOnKitStaleness,
}));

import { runJsonMode } from '../runJsonMode.ts';
import { makeKit, singleKitEntry } from '../test-utils/kit-fixtures.ts';

describe(runJsonMode, () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockFormatJsonReport.mockReturnValue('{"worstSeverity":null}');
    mockReadManifestTracking.mockReturnValue(undefined);
    mockWarnOnKitStaleness.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockLoadRdyKit.mockReset();
    mockRunRdy.mockReset();
    mockFormatJsonReport.mockReset();
    mockReportRdy.mockReset();
    mockFormatCombinedSummary.mockReset();
    mockResolveGitHubToken.mockReset();
    mockLoadRemoteKit.mockReset();
    mockReadManifestTracking.mockReset();
    mockWarnOnKitStaleness.mockReset();
  });

  it('emits JSON output and no human-readable text', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const exitCode = await runJson(singleKitEntry());

    expect(mockFormatJsonReport).toHaveBeenCalledTimes(1);
    expect(mockReportRdy).not.toHaveBeenCalled();
    expect(mockFormatCombinedSummary).not.toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalledWith('{"worstSeverity":null}\n');
    expect(exitCode).toBe(0);
  });

  it('returns exit code 1 when any checklist fails in JSON mode', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy
      .mockResolvedValueOnce({ results: [], passed: true, durationMs: 0 })
      .mockResolvedValueOnce({ results: [], passed: false, durationMs: 0 });

    const exitCode = await runJson(singleKitEntry());

    expect(exitCode).toBe(1);
  });

  it('records an unloadable kit as an error entry, leaving stderr clean', async () => {
    mockLoadRdyKit.mockRejectedValue(new Error('Kit not found'));
    mockFormatJsonReport.mockReturnValue('{}');

    const exitCode = await runJson(singleKitEntry());

    expect(exitCode).toBe(2);
    expect(mockFormatJsonReport).toHaveBeenCalledWith(
      [{ name: 'default', error: { code: 'kit-load', message: 'Kit not found' } }],
      expect.anything(),
    );
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('records an unknown checklist name as an error entry, leaving stderr clean', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockFormatJsonReport.mockReturnValue('{}');

    const exitCode = await runJson(singleKitEntry(['nonexistent']));

    expect(exitCode).toBe(2);
    expect(mockFormatJsonReport).toHaveBeenCalledWith(
      [{ name: 'default', error: { code: 'usage', message: expect.stringContaining('nonexistent') } }],
      expect.anything(),
    );
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('passes kit-grouped entries to formatJsonReport', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    const report1 = { results: [], passed: true, durationMs: 10 };
    const report2 = { results: [], passed: true, durationMs: 20 };
    mockRunRdy.mockResolvedValueOnce(report1).mockResolvedValueOnce(report2);

    await runJson(singleKitEntry(), { detail: 'full' });

    expect(mockFormatJsonReport).toHaveBeenCalledWith(
      [
        {
          name: 'default',
          entries: [
            { name: 'deploy', report: report1 },
            { name: 'infra', report: report2 },
          ],
          failOn: 'error',
          reportOn: 'recommend',
        },
      ],
      // The run named no threshold, so the run-level options carry none: the resolved values reach the
      // serializer on the kit that they governed.
      { detail: 'full' },
    );
  });

  it('sends a kit its own declared thresholds while the run level stays silent', async () => {
    const kit = makeKit({ failOn: 'warn', reportOn: 'error' });
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runJson(singleKitEntry(), { detail: 'full' });

    expect(mockFormatJsonReport).toHaveBeenCalledWith(
      [expect.objectContaining({ failOn: 'warn', reportOn: 'error' })],
      { detail: 'full' },
    );
  });

  it('echoes a threshold the invocation requested, which overrides what the kit declares', async () => {
    const kit = makeKit({ failOn: 'warn' });
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runJson(singleKitEntry(), { failOn: 'recommend' });

    expect(mockFormatJsonReport).toHaveBeenCalledWith(
      [expect.objectContaining({ failOn: 'recommend' })],
      expect.objectContaining({ failOn: 'recommend' }),
    );
  });

  it('records an undiagnosed runner crash as an internal error entry', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockRejectedValue(new Error('runner crashed'));
    mockFormatJsonReport.mockReturnValue('{}');

    const exitCode = await runJson(singleKitEntry(['deploy']));

    expect(exitCode).toBe(2);
    expect(mockFormatJsonReport).toHaveBeenCalledWith(
      [{ name: 'default', error: { code: 'internal', message: 'runner crashed' } }],
      expect.anything(),
    );
  });

  it('does not write headers in JSON mode', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runJson(singleKitEntry());

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).not.toContain('---');
  });

  it('produces JSON output with multiple kit entries', async () => {
    const kit = makeKit({
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }],
    });
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const exitCode = await runJson([
      { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
      { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
    ]);

    expect(mockFormatJsonReport).toHaveBeenCalledTimes(1);
    expect(mockFormatJsonReport).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'kit1' }), expect.objectContaining({ name: 'kit2' })]),
      expect.anything(),
    );
    expect(exitCode).toBe(0);
  });

  describe('resolved thresholds', () => {
    it('passes reportOn to formatJsonReport', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runJson(singleKitEntry(['deploy']), { reportOn: 'error' });

      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ reportOn: 'error' }),
      );
    });
  });

  describe('staleness advisories', () => {
    const SOURCE_STALE = {
      code: 'source-stale',
      message: 'kit "beta" was compiled from an older source than the one on disk.',
      remedy: 'Run `rdy compile` to rebuild it.',
    };

    const TARGET_DRIFT = {
      code: 'target-drift',
      message: 'compiled kit "alpha" does not match the hash the manifest recorded for it.',
      remedy: 'Run `rdy compile --force` to rebuild it from source.',
    };

    /** Builds two entries whose names and compiled paths differ, so a kit paired with the wrong source shows. */
    function twoKitEntries() {
      return [
        { name: 'alpha', source: { path: '.readyup/kits/alpha.js' }, checklists: ['deploy'] },
        { name: 'beta', source: { path: '.readyup/kits/beta.js' }, checklists: ['deploy'] },
      ];
    }

    it('carries every advisory the run raised into the JSON report', async () => {
      const tracking = { manifest: { version: 1, kits: [] }, manifestDir: '.readyup' };
      mockReadManifestTracking.mockReturnValue(tracking);
      mockWarnOnKitStaleness.mockReturnValueOnce([TARGET_DRIFT]).mockReturnValueOnce([SOURCE_STALE]);
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
      mockFormatJsonReport.mockReturnValue('{"kits":[]}');

      const exitCode = await runJson(twoKitEntries());

      expect(mockWarnOnKitStaleness).toHaveBeenNthCalledWith(1, 'alpha', { path: '.readyup/kits/alpha.js' }, tracking);
      expect(mockWarnOnKitStaleness).toHaveBeenNthCalledWith(2, 'beta', { path: '.readyup/kits/beta.js' }, tracking);
      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ warnings: [TARGET_DRIFT, SOURCE_STALE] }),
      );
      expect(exitCode).toBe(0);
    });

    it('omits the warnings field entirely when the run raised none', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
      mockFormatJsonReport.mockReturnValue('{}');

      await runJson(singleKitEntry(['deploy']));

      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.not.objectContaining({ warnings: expect.anything() }),
      );
    });
  });

  describe('raised hints', () => {
    const GITHUB_URL = 'https://raw.githubusercontent.com/acme/private/main/.readyup/kits/deploy.js';
    const GITHUB_HINT = 'If the repository is private, set GITHUB_TOKEN or run `gh auth login`.';

    it('carries the hint into the JSON report’s kit error entry', async () => {
      mockResolveGitHubToken.mockReturnValue(undefined);
      mockLoadRemoteKit.mockRejectedValue(new RemoteFetchError('boom', 404));
      mockFormatJsonReport.mockReturnValue('{}');

      await runJson([{ name: 'deploy', source: { url: GITHUB_URL }, checklists: [] }]);

      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        [{ name: 'deploy', error: { code: 'kit-load', message: 'boom', hint: GITHUB_HINT } }],
        expect.anything(),
      );
    });
  });
});

// region | Helpers

/** The settings a test names, over the defaults the dispatch would have resolved. */
interface JsonRunOptions {
  detail?: JsonDetail;
  failOn?: Severity;
  isJit?: boolean;
  reportOn?: Severity;
}

/** Runs the mode over the given entries, filling in every setting the test did not name. */
function runJson(
  kitEntries: ResolvedKitEntry[],
  { detail = 'full', failOn, isJit = false, reportOn }: JsonRunOptions = {},
): Promise<number> {
  return runJsonMode(kitEntries, { detail, failOn, reportOn }, isJit);
}

// endregion | Helpers
