import { beforeEach, describe, expect, it } from 'vitest';

import { kitLoadError } from '../../errors/RdyError.ts';
import { emptyCounts } from '../../reporting/reportRdy.ts';
import { runHumanMode } from '../runHumanMode.ts';
import { createRunFakes, type RunFakes } from '../test-utils/createRunFakes.ts';
import { buildSingleKitEntry, makeKit } from '../test-utils/kit-fixtures.ts';
import { runHuman } from '../test-utils/runHuman.ts';

describe(runHumanMode, () => {
  let fakes: RunFakes;

  beforeEach(() => {
    fakes = createRunFakes();
  });

  it('says the run selected no kits rather than printing nothing', async () => {
    const { exitCode, stdout } = await runHuman([], {}, fakes);

    expect(exitCode).toBe(0);
    expect(stdout).toBe('No kits to run.\n');
    expect(fakes.loadKit).not.toHaveBeenCalled();
  });

  it('names the cause and the alternatives when every configured source lacks the requested kit', async () => {
    const unrunSources = [{ spelling: 'github:acme/standards', requestedNames: ['default'], publishedNames: ['demo'] }];

    const { exitCode, stderr, stdout } = await runHuman([], { unrunSources }, fakes);

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^No kits to run: no configured source publishes a kit named "default"\.\n/);
    expect(stdout).toContain('`rdy run --sources <kit>`');
    expect(stdout).toContain('`rdy run --sources --all`');
    expect(stdout).toContain('`rdy list --sources`');
    expect(stderr).toContain('Warning: configured source "github:acme/standards" publishes no kit named "default"');
  });

  it('warns after the run about each configured source that contributed no kit', async () => {
    fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    const unrunSources = [{ spelling: 'npm:@acme/kits', requestedNames: ['default'], publishedNames: ['drift'] }];

    const { exitCode, stderr } = await runHuman(buildSingleKitEntry(), { unrunSources }, fakes);

    expect(exitCode).toBe(0);
    expect(stderr).toContain('Warning: configured source "npm:@acme/kits" publishes no kit named "default"');
  });

  it('writes a diagnosed masked pass to stderr', async () => {
    fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({
      results: [],
      passed: true,
      durationMs: 0,
      diagnoses: [{ name: 'a', verdict: 'masked-pass' }],
    });

    const { exitCode, stderr } = await runHuman(buildSingleKitEntry(['deploy']), { diagnose: true }, fakes);

    expect(stderr).toContain('skipped check "a" in kit "default" / checklist "deploy" would have passed.');
    expect(exitCode).toBe(0);
  });

  it('reports an unknown checklist name against its kit and exits 2', async () => {
    const kit = makeKit();
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });

    const { exitCode, stderr } = await runHuman(buildSingleKitEntry(['nonexistent']), {}, fakes);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('Error: Unknown name(s): nonexistent');
  });

  it('returns exit code 1 when any checklist fails', async () => {
    const kit = makeKit();
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy
      .mockResolvedValueOnce({ results: [], passed: true, durationMs: 0 })
      .mockResolvedValueOnce({ results: [], passed: false, durationMs: 0 });

    const { exitCode } = await runHuman(buildSingleKitEntry(), {}, fakes);

    expect(exitCode).toBe(1);
  });

  it('uses per-checklist fixLocation over kit default', async () => {
    const kit = makeKit({
      fixLocation: 'end',
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }], fixLocation: 'inline' }],
    });
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runHuman(buildSingleKitEntry(), {}, fakes);

    expect(fakes.reportRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fixLocation: 'inline' }));
  });

  it('falls back to kit-level fixLocation when checklist has none', async () => {
    const kit = makeKit({
      fixLocation: 'end',
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }],
    });
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runHuman(buildSingleKitEntry(), {}, fakes);

    expect(fakes.reportRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fixLocation: 'end' }));
  });

  it('reports an unloadable kit against its kit name and exits 2', async () => {
    fakes.loadKit.mockRejectedValue(kitLoadError('Kit not found'));

    const { exitCode, stderr } = await runHuman(buildSingleKitEntry(), {}, fakes);

    expect(exitCode).toBe(2);
    expect(stderr).toBe('Error: Kit not found\n');
  });

  it('states under its heading that a kit did not load, and counts it in the summary', async () => {
    fakes.loadKit
      .mockRejectedValueOnce(kitLoadError('Kit not found'))
      .mockResolvedValueOnce({ kit: makeKit(), compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { stdout } = await runHuman(
      [
        { name: 'broken', source: { path: '.readyup/kits/broken.js' }, checklists: ['deploy'] },
        { name: 'healthy', source: { path: '.readyup/kits/healthy.js' }, checklists: ['deploy'] },
      ],
      {},
      fakes,
    );

    expect(stdout).toMatch(/broken\n\S+ +Kit did not load; the error is on stderr\n/u);
    expect(fakes.formatCombinedSummary.mock.calls[0]?.[0][0]).toStrictEqual({
      counts: emptyCounts(),
      durationMs: 0,
      notRun: 'didNotLoad',
      segments: [{ role: 'kit', text: 'broken' }],
    });
  });

  it('states that a kit that loaded and then threw did not run, rather than that it did not load', async () => {
    fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { exitCode, stderr, stdout } = await runHuman(
      [
        { name: 'halted', source: { path: '.readyup/kits/halted.js' }, checklists: ['missing'] },
        { name: 'healthy', source: { path: '.readyup/kits/healthy.js' }, checklists: ['deploy'] },
      ],
      {},
      fakes,
    );

    expect(exitCode).toBe(2);
    expect(stdout).toMatch(/halted\n\S+ +Kit did not run; the error is on stderr\n/u);
    expect(stdout).not.toContain('Kit did not load');
    expect(stderr).toMatch(/^Error \[halted\]: .*missing/u);
    expect(fakes.formatCombinedSummary.mock.calls[0]?.[0][0]).toStrictEqual({
      counts: emptyCounts(),
      durationMs: 0,
      notRun: 'failedAfterLoad',
      segments: [{ role: 'kit', text: 'halted' }],
    });
  });

  it('keeps the block of a kit that threw after its first checklist, but tabulates only its not-run row', async () => {
    fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
    fakes.runRdy
      .mockResolvedValueOnce({ results: [], passed: true, durationMs: 0 })
      .mockRejectedValueOnce(new Error('runner crashed'))
      .mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { exitCode, stdout } = await runHuman(
      [
        { name: 'halted', source: { path: '.readyup/kits/halted.js' }, checklists: [] },
        { name: 'healthy', source: { path: '.readyup/kits/healthy.js' }, checklists: ['deploy'] },
      ],
      {},
      fakes,
    );

    expect(exitCode).toBe(2);
    expect(stdout).toMatch(/halted .* deploy\nreport output\n/u);
    const rows = fakes.formatCombinedSummary.mock.calls[0]?.[0] ?? [];
    expect(rows.map(({ notRun, segments }) => ({ notRun, segments }))).toStrictEqual([
      { notRun: 'failedAfterLoad', segments: [{ role: 'kit', text: 'halted' }] },
      { notRun: undefined, segments: [{ role: 'kit', text: 'healthy' }] },
    ]);
  });

  it('adds no heading or summary row for a lone kit that loaded and then threw', async () => {
    fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });

    const { exitCode, stderr, stdout } = await runHuman(buildSingleKitEntry(['missing']), {}, fakes);

    expect(exitCode).toBe(2);
    expect(stdout).not.toContain('Kit did not run');
    expect(stderr).toMatch(/^Error: .*missing/u);
    expect(fakes.formatCombinedSummary).not.toHaveBeenCalled();
  });

  it('adds no summary row for a lone kit that did not load', async () => {
    fakes.loadKit.mockRejectedValue(kitLoadError('Kit not found'));

    const { stdout } = await runHuman(buildSingleKitEntry(), {}, fakes);

    expect(stdout).not.toContain('Kit did not load');
    expect(fakes.formatCombinedSummary).not.toHaveBeenCalled();
  });
});
