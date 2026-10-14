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

import { emptyCounts } from '../../reporting/reportRdy.ts';
import { runHumanMode } from '../runHumanMode.ts';
import { makeKit, singleKitEntry } from '../test-utils/kit-fixtures.ts';
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

  it('says the run selected no kits rather than printing nothing', async () => {
    const { exitCode, stdout } = await runHuman([]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe('No kits to run.\n');
    expect(mockLoadRdyKit).not.toHaveBeenCalled();
  });

  it('names the cause and the alternatives when every configured source lacks the requested kit', async () => {
    const unrunSources = [{ spelling: 'github:acme/standards', requestedNames: ['default'], publishedNames: ['demo'] }];

    const { exitCode, stderr, stdout } = await runHuman([], { unrunSources });

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^No kits to run: no configured source publishes a kit named "default"\.\n/);
    expect(stdout).toContain('`rdy run --sources <kit>`');
    expect(stdout).toContain('`rdy run --sources --all`');
    expect(stdout).toContain('`rdy list --sources`');
    expect(stderr).toContain('Warning: configured source "github:acme/standards" publishes no kit named "default"');
  });

  it('warns after the run about each configured source that contributed no kit', async () => {
    mockLoadRdyKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    const unrunSources = [{ spelling: 'npm:@acme/kits', requestedNames: ['default'], publishedNames: ['drift'] }];

    const { exitCode, stderr } = await runHuman(singleKitEntry(), { unrunSources });

    expect(exitCode).toBe(0);
    expect(stderr).toContain('Warning: configured source "npm:@acme/kits" publishes no kit named "default"');
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

  it('asks the runner to diagnose only when --diagnose was passed', async () => {
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

    expect(mockLoadRdyKit).toHaveBeenCalledWith('custom/path.ts', 'custom');
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

  it('states under its heading that a kit did not load, and counts it in the summary', async () => {
    mockLoadRdyKit
      .mockRejectedValueOnce(new Error('Kit not found'))
      .mockResolvedValueOnce({ kit: makeKit(), compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { stdout } = await runHuman([
      { name: 'broken', source: { path: '.readyup/kits/broken.js' }, checklists: ['deploy'] },
      { name: 'healthy', source: { path: '.readyup/kits/healthy.js' }, checklists: ['deploy'] },
    ]);

    expect(stdout).toMatch(/broken\n\S+ +Kit did not load; the error is on stderr\n/u);
    expect(mockFormatCombinedSummary.mock.calls[0]?.[0][0]).toStrictEqual({
      counts: emptyCounts(),
      didNotLoad: true,
      durationMs: 0,
      segments: [{ role: 'kit', text: 'broken' }],
    });
  });

  it('adds no summary row for a lone kit that did not load', async () => {
    mockLoadRdyKit.mockRejectedValue(new Error('Kit not found'));

    const { stdout } = await runHuman(singleKitEntry());

    expect(stdout).not.toContain('Kit did not load');
    expect(mockFormatCombinedSummary).not.toHaveBeenCalled();
  });
});
