import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import type { FailedResult, PassedResult, Severity } from '../../kits/types.ts';
import type { SummaryRow } from '../../layout/layoutEngine.ts';
import { RemoteFetchError } from '../../remote/RemoteFetchError.ts';

const mockLoadRdyKit = vi.hoisted(() => vi.fn());
const mockRunRdy = vi.hoisted(() => vi.fn());
const mockReportRdy = vi.hoisted(() => vi.fn());
const mockFormatCombinedSummary = vi.hoisted(() => vi.fn<(rows: SummaryRow[]) => string>());
const mockFormatJsonReport = vi.hoisted(() => vi.fn());
const mockFormatJsonError = vi.hoisted(() => vi.fn());
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

vi.mock(import('../../reporting/formatJsonReport.ts'), () => ({
  formatJsonReport: mockFormatJsonReport,
}));

vi.mock(import('../../reporting/formatJsonError.ts'), () => ({
  formatJsonError: mockFormatJsonError,
}));

vi.mock(import('../../remote/resolveGitHubToken.ts'), () => ({
  resolveGitHubToken: mockResolveGitHubToken,
}));

vi.mock(import('../../remote/loadRemoteKit.ts'), () => ({
  loadRemoteKit: mockLoadRemoteKit,
}));

// Mocked so no case reads the repo's own manifest or hashes files on disk. `loadKit.ts` stays real, its
// errors being what the rendering cases assert.
vi.mock(import('../kit-staleness.ts'), () => ({
  readManifestTracking: mockReadManifestTracking,
  warnOnKitStaleness: mockWarnOnKitStaleness,
}));

import { runCommand } from '../runCommand.ts';
import { makeKit, singleKitEntry } from '../test-utils/kit-fixtures.ts';

/**
 * The blank line parting one block from the next, as it reads in concatenated stdout writes.
 *
 * The count includes the newline terminating the block above, so the gap a reader sees is one blank fewer.
 */
const BLOCK_GAP = '\n'.repeat(2);

/** A gap wider than one blank line, which no boundary opens. */
const WIDER_GAP = '\n'.repeat(3);

describe(runCommand, () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockReportRdy.mockReturnValue({ body: 'report output', hasVisibleResults: true });
    mockFormatCombinedSummary.mockReturnValue('combined summary');
    mockReadManifestTracking.mockReturnValue(undefined);
    mockWarnOnKitStaleness.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockLoadRdyKit.mockReset();
    mockRunRdy.mockReset();
    mockReportRdy.mockReset();
    mockFormatCombinedSummary.mockReset();
    mockFormatJsonReport.mockReset();
    mockFormatJsonError.mockReset();
    mockResolveGitHubToken.mockReset();
    mockLoadRemoteKit.mockReset();
    mockReadManifestTracking.mockReset();
    mockWarnOnKitStaleness.mockReset();
  });

  /** Every stderr write concatenated into one string. */
  function stderrText(): string {
    return stderrSpy.mock.calls.map((c) => String(c[0])).join('');
  }

  it('runs all checklists when no checklist filter is given', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const exitCode = await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    expect(mockRunRdy).toHaveBeenCalledTimes(2);
    expect(exitCode).toBe(0);
  });

  it('filters to named checklists only', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const exitCode = await runCommand({
      kitEntries: singleKitEntry(['deploy']),
      json: false,
    });

    expect(mockRunRdy).toHaveBeenCalledTimes(1);
    expect(mockRunRdy).toHaveBeenCalledWith(
      kit.checklists[0],
      expect.objectContaining({ defaultSeverity: 'error', failOn: 'error' }),
    );
    expect(exitCode).toBe(0);
  });

  it('reports an unknown checklist name against its kit and exits 2', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });

    const exitCode = await runCommand({ kitEntries: singleKitEntry(['nonexistent']), json: false });

    expect(exitCode).toBe(2);
    expect(stderrText()).toContain('Error: Unknown name(s): nonexistent');
  });

  it('returns exit code 1 when any checklist fails', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy
      .mockResolvedValueOnce({ results: [], passed: true, durationMs: 0 })
      .mockResolvedValueOnce({ results: [], passed: false, durationMs: 0 });

    const exitCode = await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    expect(exitCode).toBe(1);
  });

  it('passes kit path to local kit loader', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: [{ name: 'custom', source: { path: 'custom/path.ts' }, checklists: [] }],
      json: false,
    });

    expect(mockLoadRdyKit).toHaveBeenCalledWith('custom/path.ts');
  });

  it('shows checklist headers when running multiple checklists in a single kit', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).toContain('\u{2501}\u{2501} \u{1F4CB} deploy');
    expect(allOutput).toContain('\u{2501}\u{2501} \u{1F4CB} infra');
  });

  // One blank parts blocks of the same kit, and the summary that tallies them is parted the same way.
  it('parts one block from the next with a single blank line', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).not.toContain(WIDER_GAP);
    expect(allOutput).toContain(`${BLOCK_GAP}\u{2501}\u{2501} \u{1F4CB} infra`);
    expect(allOutput).toContain(`${BLOCK_GAP}combined summary`);
  });

  // A lone local kit running one checklist has no source to name, nothing to be told apart from, and one
  // checklist to report, so its breadcrumb would carry no segment at all. It heads nothing, and it opens
  // with no blank line either.
  it('heads nothing at all for a lone local kit running one checklist', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: singleKitEntry(['deploy']),
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).not.toContain('\u{2501}\u{2501}');
    expect(allOutput).not.toContain('\u{2500}\u{2500} ');
    expect(allOutput.startsWith('\n')).toBe(false);
  });

  it('shows kit headers when running multiple kits', async () => {
    const kit = makeKit({
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }],
    });
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: [
        { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
        { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
      ],
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).toContain('\u{2501}\u{2501} \u{1F4D3} kit1');
    expect(allOutput).toContain('\u{2501}\u{2501} \u{1F4D3} kit2');
  });

  // The heading below a gap names the kit it opens, so a kit boundary takes the same one blank line every
  // other boundary takes. The run's first block opens with none.
  it('parts one kit from the next with the same single blank line, opening with none', async () => {
    const kit = makeKit({
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }],
    });
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: [
        { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
        { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
      ],
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput.startsWith('\u{2501}\u{2501} \u{1F4D3} kit1')).toBe(true);
    expect(allOutput).toContain(`${BLOCK_GAP}\u{2501}\u{2501} \u{1F4D3} kit2`);
    expect(allOutput).not.toContain(WIDER_GAP);
  });

  // A bodiless block states nothing its table row does not, so it goes and the row reports it.
  it('leaves out a block whose tree rendered nothing', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    mockReportRdy.mockReturnValue({ body: 'report output', hasVisibleResults: false });

    await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).not.toContain('report output');
    expect(allOutput).toContain('combined summary');
  });

  // Nothing tabulates a run of one checklist, so its block stands however little it has to say.
  it('keeps a bodiless block when the run will tabulate nothing', async () => {
    const kit = makeKit({ checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }] });
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    mockReportRdy.mockReturnValue({ body: 'report output', hasVisibleResults: false });

    await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).toContain('report output');
    expect(mockFormatCombinedSummary).not.toHaveBeenCalled();
  });

  // The row is the only report a dropped block gets, so it is tabulated even with no sibling row beside it.
  it('tabulates a dropped block even when one row is all that survives', async () => {
    const kit = makeKit({ checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }] });
    mockLoadRdyKit.mockResolvedValueOnce({ kit, compileTimeVersion: undefined });
    mockLoadRdyKit.mockRejectedValueOnce(new Error('kit2 cannot be read'));
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    mockReportRdy.mockReturnValue({ body: 'report output', hasVisibleResults: false });

    await runCommand({
      kitEntries: [
        { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
        { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
      ],
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).not.toContain('report output');
    expect(allOutput).toContain('combined summary');
  });

  it('prints one combined summary covering every kit in a multi-kit run', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: [
        { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
        { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
      ],
      json: false,
    });

    expect(mockFormatCombinedSummary).toHaveBeenCalledTimes(1);
    expect(mockFormatCombinedSummary.mock.calls[0]?.[0].map((row) => row.segments)).toStrictEqual([
      [
        { role: 'kit', text: 'kit1' },
        { role: 'checklist', text: 'deploy' },
      ],
      [
        { role: 'kit', text: 'kit1' },
        { role: 'checklist', text: 'infra' },
      ],
      [
        { role: 'kit', text: 'kit2' },
        { role: 'checklist', text: 'deploy' },
      ],
      [
        { role: 'kit', text: 'kit2' },
        { role: 'checklist', text: 'infra' },
      ],
    ]);
  });

  // A kit running one checklist heads its block without naming it, and still belongs in the run's tally.
  it('gives a single-checklist kit a row of its own in a multi-kit run', async () => {
    mockLoadRdyKit.mockResolvedValue({
      kit: makeKit({ checklists: [{ name: 'only', checks: [{ name: 'a', check: () => true }] }] }),
      compileTimeVersion: undefined,
    });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: [
        { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
        { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
      ],
      json: false,
    });

    expect(mockFormatCombinedSummary.mock.calls[0]?.[0].map((row) => row.segments)).toStrictEqual([
      [{ role: 'kit', text: 'kit1' }],
      [{ role: 'kit', text: 'kit2' }],
    ]);
  });

  it('uses per-checklist fixLocation over kit default', async () => {
    const kit = makeKit({
      fixLocation: 'end',
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }], fixLocation: 'inline' }],
    });
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    expect(mockReportRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fixLocation: 'inline' }));
  });

  it('falls back to kit-level fixLocation when checklist has none', async () => {
    const kit = makeKit({
      fixLocation: 'end',
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }],
    });
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    expect(mockReportRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fixLocation: 'end' }));
  });

  it('reports an unloadable kit against its kit name and exits 2', async () => {
    mockLoadRdyKit.mockRejectedValue(new Error('Kit not found'));

    const exitCode = await runCommand({ kitEntries: singleKitEntry(), json: false });

    expect(exitCode).toBe(2);
    expect(stderrText()).toBe('Error: Kit not found\n');
  });

  it('keeps running the kits that are not at fault', async () => {
    mockLoadRdyKit
      .mockRejectedValueOnce(new Error('Kit not found'))
      .mockResolvedValueOnce({ kit: makeKit(), compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const exitCode = await runCommand({
      kitEntries: [
        { name: 'broken', source: { path: '.readyup/kits/broken.js' }, checklists: ['deploy'] },
        { name: 'healthy', source: { path: '.readyup/kits/healthy.js' }, checklists: ['deploy'] },
      ],
      json: false,
    });

    expect(exitCode).toBe(2);
    expect(mockRunRdy).toHaveBeenCalledTimes(1);
  });

  it('prints combined summary for a single kit with multiple checklists', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    mockFormatCombinedSummary.mockReturnValue('Combined summary');

    await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    expect(mockFormatCombinedSummary).toHaveBeenCalledTimes(1);
    expect(mockFormatCombinedSummary.mock.calls[0]?.[0].map((row) => row.segments)).toStrictEqual([
      [{ role: 'checklist', text: 'deploy' }],
      [{ role: 'checklist', text: 'infra' }],
    ]);
  });

  it('counts results pruned by the reporting threshold in each combined-summary row', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({
      results: [makePassedResult('gate', 'error'), makeFailedResult('lint', 'warn')],
      passed: true,
      durationMs: 0,
    });

    await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
      reportOn: 'error',
    });

    expect(mockFormatCombinedSummary).toHaveBeenCalledWith([
      expect.objectContaining({
        counts: expect.objectContaining({ passed: 1, warnings: 1, worstSeverity: 'warn' }),
        segments: [{ role: 'checklist', text: 'deploy' }],
      }),
      expect.objectContaining({
        counts: expect.objectContaining({ passed: 1, warnings: 1, worstSeverity: 'warn' }),
        segments: [{ role: 'checklist', text: 'infra' }],
      }),
    ]);
  });

  it('does not print combined summary for a single checklist', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: singleKitEntry(['deploy']),
      json: false,
    });

    expect(mockFormatCombinedSummary).not.toHaveBeenCalled();
  });

  describe('resolved thresholds', () => {
    it('passes failOn to runRdy', async () => {
      const kit = makeKit({ failOn: 'recommend' });
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({
        kitEntries: singleKitEntry(['deploy']),
        json: false,
      });

      expect(mockRunRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ failOn: 'recommend' }));
    });

    it('passes reportOn to reportRdy', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({
        kitEntries: singleKitEntry(['deploy']),
        json: false,
        reportOn: 'warn',
      });

      expect(mockReportRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reportOn: 'warn' }));
    });

    it('passes reportOn to formatJsonReport', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
      mockFormatJsonReport.mockReturnValue('{"worstSeverity":null}');

      await runCommand({
        kitEntries: singleKitEntry(['deploy']),
        json: true,
        reportOn: 'error',
      });

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

    /** Two entries whose names and compiled paths differ, so a kit paired with the wrong source shows. */
    function twoKitEntries() {
      return [
        { name: 'alpha', source: { path: '.readyup/kits/alpha.js' }, checklists: ['deploy'] },
        { name: 'beta', source: { path: '.readyup/kits/beta.js' }, checklists: ['deploy'] },
      ];
    }

    it('reads the manifest once per invocation, not once per kit', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({ kitEntries: twoKitEntries(), json: false });

      expect(mockReadManifestTracking).toHaveBeenCalledTimes(1);
    });

    it('tells the manifest read whether the run is just-in-time', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({ kitEntries: singleKitEntry(['deploy']), json: false }, true);

      expect(mockReadManifestTracking).toHaveBeenCalledWith(true);
    });

    it('advises on each kit against the source that kit resolved to', async () => {
      const tracking = { manifest: { version: 1, kits: [] }, manifestDir: '.readyup' };
      mockReadManifestTracking.mockReturnValue(tracking);
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({ kitEntries: twoKitEntries(), json: false });

      expect(mockWarnOnKitStaleness).toHaveBeenCalledTimes(2);
      expect(mockWarnOnKitStaleness).toHaveBeenNthCalledWith(1, 'alpha', { path: '.readyup/kits/alpha.js' }, tracking);
      expect(mockWarnOnKitStaleness).toHaveBeenNthCalledWith(2, 'beta', { path: '.readyup/kits/beta.js' }, tracking);
    });

    it('leaves the exit code alone, since verify is the enforcing gate', async () => {
      mockWarnOnKitStaleness.mockReturnValue([TARGET_DRIFT]);
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      const exitCode = await runCommand({ kitEntries: singleKitEntry(['deploy']), json: false });

      expect(exitCode).toBe(0);
    });

    it('carries every advisory the run raised into the JSON report', async () => {
      const tracking = { manifest: { version: 1, kits: [] }, manifestDir: '.readyup' };
      mockReadManifestTracking.mockReturnValue(tracking);
      mockWarnOnKitStaleness.mockReturnValueOnce([TARGET_DRIFT]).mockReturnValueOnce([SOURCE_STALE]);
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
      mockFormatJsonReport.mockReturnValue('{"kits":[]}');

      const exitCode = await runCommand({ kitEntries: twoKitEntries(), json: true });

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

      await runCommand({ kitEntries: singleKitEntry(['deploy']), json: true });

      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.not.objectContaining({ warnings: expect.anything() }),
      );
    });
  });

  describe('JSON mode', () => {
    beforeEach(() => {
      mockFormatJsonReport.mockReturnValue('{"worstSeverity":null}');
      mockFormatJsonError.mockReturnValue('{"error":"boom"}');
    });

    it('emits JSON output and no human-readable text', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      const exitCode = await runCommand({
        kitEntries: singleKitEntry(),
        json: true,
      });

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

      const exitCode = await runCommand({
        kitEntries: singleKitEntry(),
        json: true,
      });

      expect(exitCode).toBe(1);
    });

    it('records an unloadable kit as an error entry, leaving stderr clean', async () => {
      mockLoadRdyKit.mockRejectedValue(new Error('Kit not found'));
      mockFormatJsonReport.mockReturnValue('{}');

      const exitCode = await runCommand({ kitEntries: singleKitEntry(), json: true });

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

      const exitCode = await runCommand({ kitEntries: singleKitEntry(['nonexistent']), json: true });

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

      await runCommand({
        kitEntries: singleKitEntry(),
        json: true,
      });

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
        // A bare invocation requested no threshold, so the run-level options name none: the resolved
        // values reach the serializer on the kit that they governed.
        { detail: 'full' },
      );
    });

    it('sends a kit its own declared thresholds while the run level stays silent', async () => {
      const kit = makeKit({ failOn: 'warn', reportOn: 'error' });
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({ kitEntries: singleKitEntry(), json: true });

      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        [expect.objectContaining({ failOn: 'warn', reportOn: 'error' })],
        { detail: 'full' },
      );
    });

    it('echoes a threshold the invocation requested, which overrides what the kit declares', async () => {
      const kit = makeKit({ failOn: 'warn' });
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({ kitEntries: singleKitEntry(), json: true, failOn: 'recommend' });

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

      const exitCode = await runCommand({ kitEntries: singleKitEntry(['deploy']), json: true });

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

      await runCommand({
        kitEntries: singleKitEntry(),
        json: true,
      });

      const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(allOutput).not.toContain('---');
    });

    it('produces JSON output with multiple kit entries', async () => {
      const kit = makeKit({
        checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }],
      });
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      const exitCode = await runCommand({
        kitEntries: [
          { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
          { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
        ],
        json: true,
      });

      expect(mockFormatJsonReport).toHaveBeenCalledTimes(1);
      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'kit1' }), expect.objectContaining({ name: 'kit2' })]),
        expect.anything(),
      );
      expect(exitCode).toBe(0);
    });
  });

  describe('raised hints', () => {
    const GITHUB_URL = 'https://raw.githubusercontent.com/acme/private/main/.readyup/kits/deploy.js';
    const GITHUB_HINT = 'If the repository is private, set GITHUB_TOKEN or run `gh auth login`.';

    it('puts the hint on a line of its own, below the error', async () => {
      mockResolveGitHubToken.mockReturnValue(undefined);
      mockLoadRemoteKit.mockRejectedValue(new RemoteFetchError(`Failed to fetch remote kit from ${GITHUB_URL}`, 404));

      await runCommand({
        kitEntries: [{ name: 'deploy', source: { url: GITHUB_URL }, checklists: [] }],
        json: false,
      });

      expect(stderrText()).toBe(
        `Error: Failed to fetch remote kit from ${GITHUB_URL}\n\u{1F4A1} Hint: ${GITHUB_HINT}\n`,
      );
    });

    it('carries the hint into the JSON report’s kit error entry', async () => {
      mockResolveGitHubToken.mockReturnValue(undefined);
      mockLoadRemoteKit.mockRejectedValue(new RemoteFetchError('boom', 404));
      mockFormatJsonReport.mockReturnValue('{}');

      await runCommand({
        kitEntries: [{ name: 'deploy', source: { url: GITHUB_URL }, checklists: [] }],
        json: true,
      });

      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        [{ name: 'deploy', error: { code: 'kit-load', message: 'boom', hint: GITHUB_HINT } }],
        expect.anything(),
      );
    });
  });
});

/** Builds a passed result at the given severity. */
function makePassedResult(name: string, severity: Severity): PassedResult {
  return {
    name,
    status: 'passed',
    ok: true,
    severity,
    quiet: false,
    detail: null,
    fix: null,
    error: null,
    progress: null,
    durationMs: 0,
    depth: 0,
  };
}

/** Builds a failed result at the given severity. */
function makeFailedResult(name: string, severity: Severity): FailedResult {
  return {
    name,
    status: 'failed',
    ok: false,
    severity,
    quiet: false,
    detail: null,
    fix: null,
    error: null,
    progress: null,
    durationMs: 0,
    depth: 0,
  };
}
