import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RdyReport, Severity } from '../../kits/types.ts';
import { RemoteFetchError } from '../../remote/RemoteFetchError.ts';
import type { JsonDetail } from '../../schemas/reportSchema.ts';
import type { ResolvedKitEntry } from '../ResolvedKitEntry.ts';
import type { RunRdyOptions } from '../runRdy.ts';

const mockLoadRdyKit = vi.hoisted(() => vi.fn());
const mockRunRdy = vi.hoisted(() => vi.fn<(checklist: unknown, options?: RunRdyOptions) => Promise<RdyReport>>());
const mockFormatJsonReport = vi.hoisted(() => vi.fn());
const mockReportRdy = vi.hoisted(() => vi.fn());
const mockFormatCombinedSummary = vi.hoisted(() => vi.fn());
const mockResolveGitHubToken = vi.hoisted(() => vi.fn());
const mockLoadRemoteKit = vi.hoisted(() => vi.fn());
const mockReadManifestTracking = vi.hoisted(() => vi.fn());
const mockWarnOnKitStaleness = vi.hoisted(() => vi.fn());
const mockWarnOnUnusedPragmas = vi.hoisted(() => vi.fn());

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

// Mocked so no case reads the sources the ledger names; what the report itself writes is covered by its own tests.
vi.mock(import('../pragma-report.ts'), () => ({
  warnOnUnusedPragmas: mockWarnOnUnusedPragmas,
}));

import { runJsonMode } from '../runJsonMode.ts';
import { makeKit, singleKitEntry } from '../test-utils/kit-fixtures.ts';

describe(runJsonMode, () => {
  beforeEach(() => {
    mockFormatJsonReport.mockReturnValue('{"worstSeverity":null}');
    mockReadManifestTracking.mockReturnValue(undefined);
    mockWarnOnKitStaleness.mockReturnValue([]);
    mockWarnOnUnusedPragmas.mockReturnValue([]);
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
    mockWarnOnUnusedPragmas.mockReset();
  });

  it('emits JSON output and no human-readable text', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { exitCode, stdout } = await runJson(singleKitEntry());

    expect(mockFormatJsonReport).toHaveBeenCalledTimes(1);
    expect(mockReportRdy).not.toHaveBeenCalled();
    expect(mockFormatCombinedSummary).not.toHaveBeenCalled();
    expect(stdout).toBe('{"worstSeverity":null}\n');
    expect(exitCode).toBe(0);
  });

  it('returns exit code 1 when any checklist fails in JSON mode', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy
      .mockResolvedValueOnce({ results: [], passed: true, durationMs: 0 })
      .mockResolvedValueOnce({ results: [], passed: false, durationMs: 0 });

    const { exitCode } = await runJson(singleKitEntry());

    expect(exitCode).toBe(1);
  });

  it('records an unloadable kit as an error entry, leaving stderr clean', async () => {
    mockLoadRdyKit.mockRejectedValue(new Error('Kit not found'));
    mockFormatJsonReport.mockReturnValue('{}');

    const { exitCode, stderr } = await runJson(singleKitEntry());

    expect(exitCode).toBe(2);
    expect(mockFormatJsonReport).toHaveBeenCalledWith(
      [{ name: 'default', error: { code: 'kit-load', message: 'Kit not found' } }],
      expect.anything(),
    );
    expect(stderr).toBe('');
  });

  it('records an unknown checklist name as an error entry, leaving stderr clean', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockFormatJsonReport.mockReturnValue('{}');

    const { exitCode, stderr } = await runJson(singleKitEntry(['nonexistent']));

    expect(exitCode).toBe(2);
    expect(mockFormatJsonReport).toHaveBeenCalledWith(
      [{ name: 'default', error: { code: 'usage', message: expect.stringContaining('nonexistent') } }],
      expect.anything(),
    );
    expect(stderr).toBe('');
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
      // The run named no threshold, so the run-level options have none: the resolved values reach the
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

    const { exitCode } = await runJson(singleKitEntry(['deploy']));

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

    const { stdout } = await runJson(singleKitEntry());
    expect(stdout).not.toContain('---');
  });

  it('produces JSON output with multiple kit entries', async () => {
    const kit = makeKit({
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }],
    });
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { exitCode } = await runJson([
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

    it('passes every advisory the run raised into the JSON report', async () => {
      const tracking = { manifest: { version: 1, kits: [] }, manifestDir: '.readyup' };
      mockReadManifestTracking.mockReturnValue(tracking);
      mockWarnOnKitStaleness.mockReturnValueOnce([TARGET_DRIFT]).mockReturnValueOnce([SOURCE_STALE]);
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
      mockFormatJsonReport.mockReturnValue('{"kits":[]}');

      const { exitCode } = await runJson(twoKitEntries());

      expect(mockWarnOnKitStaleness).toHaveBeenNthCalledWith(1, 'alpha', { path: '.readyup/kits/alpha.js' }, tracking);
      expect(mockWarnOnKitStaleness).toHaveBeenNthCalledWith(2, 'beta', { path: '.readyup/kits/beta.js' }, tracking);
      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ warnings: [TARGET_DRIFT, SOURCE_STALE] }),
      );
      expect(exitCode).toBe(0);
    });

    it('puts a diagnosed masked pass into the report and onto stderr', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({
        results: [],
        passed: true,
        durationMs: 0,
        diagnoses: [{ name: 'a', verdict: 'masked-pass' }],
      });
      mockFormatJsonReport.mockReturnValue('{"kits":[]}');

      const { stderr } = await runJson(singleKitEntry(['deploy']), { diagnose: true });

      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          warnings: [expect.objectContaining({ code: 'skip-masks-pass' })],
        }),
      );
      expect(stderr).toContain('skipped check "a" in kit "default" / checklist "deploy" would have passed.');
    });

    it('asks the runner to diagnose only where --diagnose was passed', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runJson(singleKitEntry(['deploy']));
      expect(mockRunRdy).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ diagnose: false }));

      await runJson(singleKitEntry(['deploy']), { diagnose: true });
      expect(mockRunRdy).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ diagnose: true }));
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

  describe('unused-pragma advisories', () => {
    const PRAGMA_UNUSED = {
      code: 'pragma-unused',
      message: '`rdy-ignore` pragma at src/a.ts:3 suppressed no finding in this run.',
      remedy: 'Remove the pragma, or run the kit whose check it was written for.',
    };

    it('reports once over one ledger shared by every checklist of the invocation', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runJson(singleKitEntry());

      const ledgers = mockRunRdy.mock.calls.map(([, options]) => options?.pragmaLedger);
      expect(ledgers).toHaveLength(2);
      expect(new Set(ledgers).size).toBe(1);
      expect(mockWarnOnUnusedPragmas).toHaveBeenCalledExactlyOnceWith(ledgers[0]);
    });

    it('passes the entries into the report’s warnings', async () => {
      mockWarnOnUnusedPragmas.mockReturnValue([PRAGMA_UNUSED]);
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      const { exitCode } = await runJson(singleKitEntry(['deploy']));

      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ warnings: [PRAGMA_UNUSED] }),
      );
      expect(exitCode).toBe(0);
    });
  });

  describe('raised hints', () => {
    const GITHUB_URL = 'https://raw.githubusercontent.com/acme/private/main/.readyup/kits/deploy.js';
    const GITHUB_HINT = 'If the repository is private, set GITHUB_TOKEN or run `gh auth login`.';

    it('passes the hint into the JSON report’s kit error entry', async () => {
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
  diagnose?: boolean;
  failOn?: Severity;
  isJit?: boolean;
  reportOn?: Severity;
}

/**
 * Runs the mode over the given entries, filling in every setting the test did not name, and returns its
 * exit code alongside everything it wrote.
 */
async function runJson(
  kitEntries: ResolvedKitEntry[],
  { detail = 'full', diagnose = false, failOn, isJit = false, reportOn }: JsonRunOptions = {},
) {
  using io = captureStdio();

  const exitCode = await runJsonMode(kitEntries, { detail, diagnose, failOn, reportOn }, isJit);

  return { exitCode, stdout: io.stdout, stderr: io.stderr };
}

// endregion | Helpers
