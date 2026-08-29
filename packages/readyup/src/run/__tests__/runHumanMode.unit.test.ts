import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { KitProvenance } from '../../kits/KitProvenance.ts';
import type { FailedResult, PassedResult, RdyReport, Severity } from '../../kits/types.ts';
import type { SummaryRow } from '../../layout/layoutEngine.ts';
import { RemoteFetchError } from '../../remote/RemoteFetchError.ts';
import type { ResolvedKitEntry } from '../ResolvedKitEntry.ts';
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

// Mocked so no case reads the repo's own manifest or hashes files on disk. `loadKit.ts` stays real, its
// errors being what the rendering cases assert.
vi.mock(import('../kit-staleness.ts'), () => ({
  readManifestTracking: mockReadManifestTracking,
  warnOnKitStaleness: mockWarnOnKitStaleness,
}));

// Mocked so no case reads the sources the ledger names; what the report itself writes is covered by its own tests.
vi.mock(import('../pragma-report.ts'), () => ({
  warnOnUnusedPragmas: mockWarnOnUnusedPragmas,
}));

import { runHumanMode } from '../runHumanMode.ts';
import { makeKit, singleKitEntry } from '../test-utils/kit-fixtures.ts';

/**
 * The blank line separating one block from the next, as it reads in concatenated stdout writes.
 *
 * The count includes the newline terminating the block above, so the gap a reader sees is one blank fewer.
 */
const BLOCK_GAP = '\n'.repeat(2);

/** A gap wider than one blank line, which no boundary opens. */
const WIDER_GAP = '\n'.repeat(3);

describe(runHumanMode, () => {
  beforeEach(() => {
    mockReportRdy.mockReturnValue({ body: 'report output', hasVisibleResults: true });
    mockFormatCombinedSummary.mockReturnValue('combined summary');
    mockReadManifestTracking.mockReturnValue({ tracking: undefined, warnings: [] });
    mockWarnOnKitStaleness.mockReturnValue([]);
    mockWarnOnUnusedPragmas.mockReturnValue([]);
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
  });

  it('says the run selected no kits rather than printing nothing', async () => {
    const { exitCode, stdout } = await runHuman([]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe('No kits to run.\n');
    expect(mockLoadRdyKit).not.toHaveBeenCalled();
  });

  it('runs all checklists when no checklist filter is given', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { exitCode } = await runHuman(singleKitEntry());

    expect(mockRunRdy).toHaveBeenCalledTimes(2);
    expect(exitCode).toBe(0);
  });

  it('filters to named checklists only', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { exitCode } = await runHuman(singleKitEntry(['deploy']));

    expect(mockRunRdy).toHaveBeenCalledTimes(1);
    expect(mockRunRdy).toHaveBeenCalledWith(
      kit.checklists[0],
      expect.objectContaining({ defaultSeverity: 'error', failOn: 'error' }),
    );
    expect(exitCode).toBe(0);
  });

  it('writes a diagnosed masked pass to stderr', async () => {
    mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({
      results: [],
      passed: true,
      durationMs: 0,
      diagnoses: [{ name: 'a', verdict: 'masked-pass' }],
    });

    const { exitCode, stderr } = await runHuman(singleKitEntry(['deploy']), { diagnose: true });

    expect(stderr).toContain('skipped check "a" in kit "default" / checklist "deploy" would have passed.');
    expect(exitCode).toBe(0);
  });

  it('asks the runner to diagnose only where --diagnose was passed', async () => {
    mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runHuman(singleKitEntry(['deploy']));
    expect(mockRunRdy).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ diagnose: false }));

    await runHuman(singleKitEntry(['deploy']), { diagnose: true });
    expect(mockRunRdy).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ diagnose: true }));
  });

  it('reports an unknown checklist name against its kit and exits 2', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });

    const { exitCode, stderr } = await runHuman(singleKitEntry(['nonexistent']));

    expect(exitCode).toBe(2);
    expect(stderr).toContain('Error: Unknown name(s): nonexistent');
  });

  it('returns exit code 1 when any checklist fails', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy
      .mockResolvedValueOnce({ results: [], passed: true, durationMs: 0 })
      .mockResolvedValueOnce({ results: [], passed: false, durationMs: 0 });

    const { exitCode } = await runHuman(singleKitEntry());

    expect(exitCode).toBe(1);
  });

  it('passes kit path to local kit loader', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runHuman([{ name: 'custom', source: { path: 'custom/path.ts' }, checklists: [] }]);

    expect(mockLoadRdyKit).toHaveBeenCalledWith('custom/path.ts');
  });

  it('shows checklist headers when running multiple checklists in a single kit', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { stdout: allOutput } = await runHuman(singleKitEntry());

    expect(allOutput).toContain('\u{2501}\u{2501} \u{1F4CB} deploy');
    expect(allOutput).toContain('\u{2501}\u{2501} \u{1F4CB} infra');
  });

  // One blank separates blocks of the same kit, and the summary that tallies them is separated the same way.
  it('separates one block from the next with a single blank line', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { stdout: allOutput } = await runHuman(singleKitEntry());

    expect(allOutput).not.toContain(WIDER_GAP);
    expect(allOutput).toContain(`${BLOCK_GAP}\u{2501}\u{2501} \u{1F4CB} infra`);
    expect(allOutput).toContain(`${BLOCK_GAP}combined summary`);
  });

  // A lone local kit running one checklist has no source to name, nothing to be told apart from, and one checklist to
  // report, so its breadcrumb would have no segment at all.
  it('heads nothing at all for a lone local kit running one checklist', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { stdout: allOutput } = await runHuman(singleKitEntry(['deploy']));

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

    const { stdout: allOutput } = await runHuman([
      { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
      { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
    ]);

    expect(allOutput).toContain('\u{2501}\u{2501} \u{1F4D3} kit1');
    expect(allOutput).toContain('\u{2501}\u{2501} \u{1F4D3} kit2');
  });

  describe('provenance in the block heading', () => {
    /** Runs one kit with the given provenance, returning everything it wrote to stdout. */
    async function headingFor(provenance: KitProvenance): Promise<string> {
      const kit = makeKit({ checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }] });
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      const { stdout } = await runHuman([
        { name: 'deploy', source: { path: '.readyup/kits/deploy.js' }, checklists: [], provenance },
      ]);

      return stdout;
    }

    it('names a remote kit by the source it was fetched from', async () => {
      await expect(headingFor({ kind: 'remote', label: 'github:org/repo@main' })).resolves.toContain(
        '\u{1F310} github:org/repo@main / \u{1F4D3} deploy',
      );
    });

    it('names a kit resolved from another directory by that directory', async () => {
      await expect(headingFor({ kind: 'directory', label: '../sibling-repo/.readyup/kits' })).resolves.toContain(
        '\u{1F4C1} ../sibling-repo/.readyup/kits / \u{1F4D3} deploy',
      );
    });

    // The label is what `path.dirname` yields for a bare filename, and the only form the producer emits that
    // normalizes to the working directory.
    it('names no directory for a kit resolved from the working directory', async () => {
      const allOutput = await headingFor({ kind: 'directory', label: '.' });

      expect(allOutput).not.toContain('\u{1F4C1}');
      expect(allOutput).not.toContain('\u{1F4D3} deploy');
    });

    it('names a package kit by its package and version', async () => {
      await expect(headingFor({ kind: 'package', packageName: '@acme/kits', version: '2.1.0' })).resolves.toContain(
        '\u{1F4E6} @acme/kits@2.1.0 / \u{1F4D3} deploy',
      );
    });

    it('names a package kit by its package alone when it declares no version', async () => {
      const allOutput = await headingFor({ kind: 'package', packageName: '@acme/kits', version: undefined });

      expect(allOutput).toContain('\u{1F4E6} @acme/kits / \u{1F4D3} deploy');
      expect(allOutput).not.toContain('@acme/kits@');
    });
  });

  // The heading below a gap names the kit it opens, so a kit boundary takes the same one blank line every
  // other boundary takes. The run's first block opens with none.
  it('separates one kit from the next with the same single blank line, opening with none', async () => {
    const kit = makeKit({
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }],
    });
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { stdout: allOutput } = await runHuman([
      { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
      { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
    ]);

    expect(allOutput.startsWith('\u{2501}\u{2501} \u{1F4D3} kit1')).toBe(true);
    expect(allOutput).toContain(`${BLOCK_GAP}\u{2501}\u{2501} \u{1F4D3} kit2`);
    expect(allOutput).not.toContain(WIDER_GAP);
  });

  it('leaves out a block whose tree rendered nothing', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    mockReportRdy.mockReturnValue({ body: 'report output', hasVisibleResults: false });

    const { stdout: allOutput } = await runHuman(singleKitEntry());

    expect(allOutput).not.toContain('report output');
    expect(allOutput).toContain('combined summary');
  });

  it('keeps a bodiless block when the run will tabulate nothing', async () => {
    const kit = makeKit({ checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }] });
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    mockReportRdy.mockReturnValue({ body: 'report output', hasVisibleResults: false });

    const { stdout: allOutput } = await runHuman(singleKitEntry());

    expect(allOutput).toContain('report output');
    expect(mockFormatCombinedSummary).not.toHaveBeenCalled();
  });

  it('tabulates a dropped block even when one row is all that survives', async () => {
    const kit = makeKit({ checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }] });
    mockLoadRdyKit.mockResolvedValueOnce({ kit, compileTimeVersion: undefined });
    mockLoadRdyKit.mockRejectedValueOnce(new Error('kit2 cannot be read'));
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    mockReportRdy.mockReturnValue({ body: 'report output', hasVisibleResults: false });

    const { stdout: allOutput } = await runHuman([
      { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
      { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
    ]);

    expect(allOutput).not.toContain('report output');
    expect(allOutput).toContain('combined summary');
  });

  it('prints one combined summary covering every kit in a multi-kit run', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runHuman([
      { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
      { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
    ]);

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

  it('gives a single-checklist kit a row of its own in a multi-kit run', async () => {
    mockLoadRdyKit.mockResolvedValue({
      kit: makeKit({ checklists: [{ name: 'only', checks: [{ name: 'a', check: () => true }] }] }),
      compileTimeVersion: undefined,
    });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runHuman([
      { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
      { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
    ]);

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

    await runHuman(singleKitEntry());

    expect(mockReportRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fixLocation: 'inline' }));
  });

  it('falls back to kit-level fixLocation when checklist has none', async () => {
    const kit = makeKit({
      fixLocation: 'end',
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }],
    });
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runHuman(singleKitEntry());

    expect(mockReportRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fixLocation: 'end' }));
  });

  it('reports an unloadable kit against its kit name and exits 2', async () => {
    mockLoadRdyKit.mockRejectedValue(new Error('Kit not found'));

    const { exitCode, stderr } = await runHuman(singleKitEntry());

    expect(exitCode).toBe(2);
    expect(stderr).toBe('Error: Kit not found\n');
  });

  it('keeps running the kits that are not at fault', async () => {
    mockLoadRdyKit
      .mockRejectedValueOnce(new Error('Kit not found'))
      .mockResolvedValueOnce({ kit: makeKit(), compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { exitCode } = await runHuman([
      { name: 'broken', source: { path: '.readyup/kits/broken.js' }, checklists: ['deploy'] },
      { name: 'healthy', source: { path: '.readyup/kits/healthy.js' }, checklists: ['deploy'] },
    ]);

    expect(exitCode).toBe(2);
    expect(mockRunRdy).toHaveBeenCalledTimes(1);
  });

  it('prints combined summary for a single kit with multiple checklists', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    mockFormatCombinedSummary.mockReturnValue('Combined summary');

    await runHuman(singleKitEntry());

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

    await runHuman(singleKitEntry(), { reportOn: 'error' });

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

    await runHuman(singleKitEntry(['deploy']));

    expect(mockFormatCombinedSummary).not.toHaveBeenCalled();
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

  describe('staleness advisories', () => {
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

    it('reads the manifest once per invocation, not once per kit', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runHuman(twoKitEntries());

      expect(mockReadManifestTracking).toHaveBeenCalledTimes(1);
    });

    it('tells the manifest read whether the run is just-in-time', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runHuman(singleKitEntry(['deploy']), { isJit: true });

      expect(mockReadManifestTracking).toHaveBeenCalledWith(true);
    });

    it('advises on each kit against the source that kit resolved to', async () => {
      const tracking = { manifest: { version: 1, kits: [] }, manifestDir: '.readyup' };
      mockReadManifestTracking.mockReturnValue({ tracking, warnings: [] });
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runHuman(twoKitEntries());

      expect(mockWarnOnKitStaleness).toHaveBeenCalledTimes(2);
      expect(mockWarnOnKitStaleness).toHaveBeenNthCalledWith(1, 'alpha', { path: '.readyup/kits/alpha.js' }, tracking);
      expect(mockWarnOnKitStaleness).toHaveBeenNthCalledWith(2, 'beta', { path: '.readyup/kits/beta.js' }, tracking);
    });

    it('leaves the exit code alone, since verify is the enforcing gate', async () => {
      mockWarnOnKitStaleness.mockReturnValue([TARGET_DRIFT]);
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      const { exitCode } = await runHuman(singleKitEntry(['deploy']));

      expect(exitCode).toBe(0);
    });
  });

  describe('unused-pragma advisories', () => {
    /** Builds two entries whose names and compiled paths differ, so a per-kit ledger would show as two. */
    function twoKitEntries() {
      return [
        { name: 'alpha', source: { path: '.readyup/kits/alpha.js' }, checklists: ['deploy'] },
        { name: 'beta', source: { path: '.readyup/kits/beta.js' }, checklists: ['deploy'] },
      ];
    }

    it('reports once over one ledger shared by every kit of the invocation', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runHuman(twoKitEntries());

      const ledgers = mockRunRdy.mock.calls.map(([, options]) => options?.pragmaLedger);
      expect(ledgers).toHaveLength(2);
      expect(new Set(ledgers).size).toBe(1);
      expect(mockWarnOnUnusedPragmas).toHaveBeenCalledExactlyOnceWith(ledgers[0]);
    });

    it('reports after the summary table, the last block a pragma’s file may be named in', async () => {
      mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runHuman(twoKitEntries());

      const [summaryOrder] = mockFormatCombinedSummary.mock.invocationCallOrder;
      const [reportOrder] = mockWarnOnUnusedPragmas.mock.invocationCallOrder;
      expect(summaryOrder).toBeLessThan(reportOrder ?? 0);
    });

    it('reports over the kits that ran where another failed to load', async () => {
      mockLoadRdyKit.mockRejectedValue(new Error('Kit not found'));

      const { exitCode } = await runHuman(singleKitEntry(['deploy']));

      expect(mockWarnOnUnusedPragmas).toHaveBeenCalledTimes(1);
      expect(exitCode).toBe(2);
    });
  });

  describe('raised hints', () => {
    const GITHUB_URL = 'https://raw.githubusercontent.com/acme/private/main/.readyup/kits/deploy.js';
    const GITHUB_HINT = 'If the repository is private, set GITHUB_TOKEN or run `gh auth login`.';

    it('puts the hint on a line of its own, below the error', async () => {
      mockResolveGitHubToken.mockReturnValue(undefined);
      mockLoadRemoteKit.mockRejectedValue(new RemoteFetchError(`Failed to fetch remote kit from ${GITHUB_URL}`, 404));

      const { stderr } = await runHuman([{ name: 'deploy', source: { url: GITHUB_URL }, checklists: [] }]);

      expect(stderr).toBe(`Error: Failed to fetch remote kit from ${GITHUB_URL}\n\u{1F4A1} Hint: ${GITHUB_HINT}\n`);
    });
  });
});

// region | Helpers

/** Builds a failed result at the given severity. */
function makeFailedResult(name: string, severity: Severity): FailedResult {
  return {
    name,
    id: null,
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

/** Builds a passed result at the given severity. */
function makePassedResult(name: string, severity: Severity): PassedResult {
  return {
    name,
    id: null,
    status: 'passed',
    ok: true,
    severity,
    quiet: false,
    detail: null,
    error: null,
    progress: null,
    durationMs: 0,
    depth: 0,
  };
}

/** The settings a test names, over the defaults the dispatch would have resolved. */
interface HumanRunOptions {
  diagnose?: boolean;
  failOn?: Severity;
  isJit?: boolean;
  quiet?: boolean;
  reportOn?: Severity;
}

/**
 * Runs the mode over the given entries, filling in every setting the test did not name, and returns its
 * exit code alongside everything it wrote.
 */
async function runHuman(
  kitEntries: ResolvedKitEntry[],
  { diagnose = false, failOn, isJit = false, quiet = false, reportOn }: HumanRunOptions = {},
) {
  using io = captureStdio();

  const exitCode = await runHumanMode(kitEntries, { diagnose, failOn, quiet, reportOn }, isJit);

  return { exitCode, stdout: io.stdout, stderr: io.stderr };
}

// endregion | Helpers
