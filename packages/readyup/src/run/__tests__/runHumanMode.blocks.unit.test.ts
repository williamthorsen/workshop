import { beforeEach, describe, expect, it } from 'vitest';

import { kitLoadError } from '../../errors/RdyError.ts';
import type { KitProvenance } from '../../kits/KitProvenance.ts';
import { runHumanMode } from '../runHumanMode.ts';
import { createRunFakes, type RunFakes } from '../test-utils/createRunFakes.ts';
import { buildSingleKitEntry, makeKit } from '../test-utils/kit-fixtures.ts';
import { makeFailedResult, makePassedResult } from '../test-utils/result-fixtures.ts';
import { runHuman } from '../test-utils/runHuman.ts';

/**
 * The blank line separating one block from the next, as it reads in concatenated stdout writes.
 *
 * The count includes the newline terminating the block above, so the gap that a reader sees is one blank fewer.
 */
const BLOCK_GAP = '\n'.repeat(2);

/** A gap wider than one blank line, which no boundary opens. */
const WIDER_GAP = '\n'.repeat(3);

describe(runHumanMode, () => {
  let fakes: RunFakes;

  beforeEach(() => {
    fakes = createRunFakes();
  });

  it('shows checklist headers when running multiple checklists in a single kit', async () => {
    const kit = makeKit();
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { stdout: allOutput } = await runHuman(buildSingleKitEntry(), {}, fakes);

    expect(allOutput).toContain('\u{2501}\u{2501} \u{1F4CB} deploy');
    expect(allOutput).toContain('\u{2501}\u{2501} \u{1F4CB} infra');
  });

  // One blank separates blocks of the same kit, and the summary that tallies them is separated the same way.
  it('separates one block from the next with a single blank line', async () => {
    const kit = makeKit();
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { stdout: allOutput } = await runHuman(buildSingleKitEntry(), {}, fakes);

    expect(allOutput).not.toContain(WIDER_GAP);
    expect(allOutput).toContain(`${BLOCK_GAP}\u{2501}\u{2501} \u{1F4CB} infra`);
    expect(allOutput).toContain(`${BLOCK_GAP}combined summary`);
  });

  // A lone local kit running one checklist has no source to name, nothing to be told apart from, and one checklist to
  // report, so its breadcrumb would have no segment at all.
  it('prints no heading at all for a lone local kit running one checklist', async () => {
    const kit = makeKit();
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { stdout: allOutput } = await runHuman(buildSingleKitEntry(['deploy']), {}, fakes);

    expect(allOutput).not.toContain('\u{2501}\u{2501}');
    expect(allOutput).not.toContain('\u{2500}\u{2500} ');
    expect(allOutput.startsWith('\n')).toBe(false);
  });

  it('shows kit headers when running multiple kits', async () => {
    const kit = makeKit({
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }],
    });
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { stdout: allOutput } = await runHuman(
      [
        { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
        { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
      ],
      {},
      fakes,
    );

    expect(allOutput).toContain('\u{2501}\u{2501} \u{1F4D3} kit1');
    expect(allOutput).toContain('\u{2501}\u{2501} \u{1F4D3} kit2');
  });

  describe('provenance in the block heading', () => {
    /** Runs one kit with the given provenance, returning everything it wrote to stdout. */
    async function headingFor(provenance: KitProvenance): Promise<string> {
      const kit = makeKit({ checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }] });
      fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      const { stdout } = await runHuman(
        [{ name: 'deploy', source: { path: '.readyup/kits/deploy.js' }, checklists: [], provenance }],
        {},
        fakes,
      );

      return stdout;
    }

    it('names a remote kit by the source from which it was fetched', async () => {
      await expect(headingFor({ kind: 'remote', label: 'github:org/repo@main' })).resolves.toContain(
        '\u{1F310} github:org/repo@main / \u{1F4D3} deploy',
      );
    });

    it('names a repository kit by its source with the ref resolved', async () => {
      const heading = headingFor({
        kind: 'repository',
        host: 'github',
        owner: 'org',
        repo: 'repo',
        ref: 'main',
        source: 'github:org/repo',
      });

      await expect(heading).resolves.toContain('\u{1F310} github:org/repo@main / \u{1F4D3} deploy');
    });

    it('names a kit resolved from another directory by that directory', async () => {
      await expect(headingFor({ kind: 'directory', label: '../sibling-repo/.readyup/kits' })).resolves.toContain(
        '\u{1F4C1} ../sibling-repo/.readyup/kits / \u{1F4D3} deploy',
      );
    });

    // The label is what `path.dirname` yields for a bare filename, and the only form emitted by the producer
    // that normalizes to the working directory.
    it('names no directory for a kit resolved from the working directory', async () => {
      const allOutput = await headingFor({ kind: 'directory', label: '.' });

      expect(allOutput).not.toContain('\u{1F4C1}');
      expect(allOutput).not.toContain('\u{1F4D3} deploy');
    });

    it('names a package kit by its package and version', async () => {
      await expect(
        headingFor({ kind: 'package', packageName: '@acme/kits', version: '2.1.0', source: 'npm:@acme/kits' }),
      ).resolves.toContain('\u{1F4E6} @acme/kits@2.1.0 / \u{1F4D3} deploy');
    });

    it('names a package kit by its package alone when it declares no version', async () => {
      const allOutput = await headingFor({
        kind: 'package',
        packageName: '@acme/kits',
        version: undefined,
        source: 'npm:@acme/kits',
      });

      expect(allOutput).toContain('\u{1F4E6} @acme/kits / \u{1F4D3} deploy');
      expect(allOutput).not.toContain('@acme/kits@');
    });
  });

  // The heading below a gap names the kit that it opens, so a kit boundary takes the same one blank line as
  // every other boundary. The run's first block opens with none.
  it('separates one kit from the next with the same single blank line, opening with none', async () => {
    const kit = makeKit({
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }],
    });
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { stdout: allOutput } = await runHuman(
      [
        { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
        { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
      ],
      {},
      fakes,
    );

    expect(allOutput.startsWith('\u{2501}\u{2501} \u{1F4D3} kit1')).toBe(true);
    expect(allOutput).toContain(`${BLOCK_GAP}\u{2501}\u{2501} \u{1F4D3} kit2`);
    expect(allOutput).not.toContain(WIDER_GAP);
  });

  it('leaves out a block whose tree rendered nothing', async () => {
    const kit = makeKit();
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    fakes.reportRdy.mockReturnValue({ body: 'report output', hasVisibleResults: false });

    const { stdout: allOutput } = await runHuman(buildSingleKitEntry(), {}, fakes);

    expect(allOutput).not.toContain('report output');
    expect(allOutput).toContain('combined summary');
  });

  it('keeps a bodiless block when the run will tabulate nothing', async () => {
    const kit = makeKit({ checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }] });
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    fakes.reportRdy.mockReturnValue({ body: 'report output', hasVisibleResults: false });

    const { stdout: allOutput } = await runHuman(buildSingleKitEntry(), {}, fakes);

    expect(allOutput).toContain('report output');
    expect(fakes.formatCombinedSummary).not.toHaveBeenCalled();
  });

  it('tabulates a dropped block even when one row is all that survives', async () => {
    const kit = makeKit({ checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }] });
    fakes.loadKit.mockResolvedValueOnce({ kit, compileTimeVersion: undefined });
    fakes.loadKit.mockRejectedValueOnce(kitLoadError('kit2 cannot be read'));
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    fakes.reportRdy.mockReturnValue({ body: 'report output', hasVisibleResults: false });

    const { stdout: allOutput } = await runHuman(
      [
        { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
        { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
      ],
      {},
      fakes,
    );

    expect(allOutput).not.toContain('report output');
    expect(allOutput).toContain('combined summary');
  });

  it('prints one combined summary covering every kit in a multi-kit run', async () => {
    const kit = makeKit();
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runHuman(
      [
        { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
        { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
      ],
      {},
      fakes,
    );

    expect(fakes.formatCombinedSummary).toHaveBeenCalledTimes(1);
    expect(fakes.formatCombinedSummary.mock.calls[0]?.[0].map((row) => row.segments)).toStrictEqual([
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
    fakes.loadKit.mockResolvedValue({
      kit: makeKit({ checklists: [{ name: 'only', checks: [{ name: 'a', check: () => true }] }] }),
      compileTimeVersion: undefined,
    });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runHuman(
      [
        { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
        { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
      ],
      {},
      fakes,
    );

    expect(fakes.formatCombinedSummary.mock.calls[0]?.[0].map((row) => row.segments)).toStrictEqual([
      [{ role: 'kit', text: 'kit1' }],
      [{ role: 'kit', text: 'kit2' }],
    ]);
  });

  it('prints combined summary for a single kit with multiple checklists', async () => {
    const kit = makeKit();
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    fakes.formatCombinedSummary.mockReturnValue('Combined summary');

    await runHuman(buildSingleKitEntry(), {}, fakes);

    expect(fakes.formatCombinedSummary).toHaveBeenCalledTimes(1);
    expect(fakes.formatCombinedSummary.mock.calls[0]?.[0].map((row) => row.segments)).toStrictEqual([
      [{ role: 'checklist', text: 'deploy' }],
      [{ role: 'checklist', text: 'infra' }],
    ]);
  });

  it('counts results pruned by the reporting threshold in each combined-summary row', async () => {
    const kit = makeKit();
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({
      results: [makePassedResult('gate', 'error'), makeFailedResult('lint', 'warn')],
      passed: true,
      durationMs: 0,
    });

    await runHuman(buildSingleKitEntry(), { reportOn: 'error' }, fakes);

    expect(fakes.formatCombinedSummary).toHaveBeenCalledWith([
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
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runHuman(buildSingleKitEntry(['deploy']), {}, fakes);

    expect(fakes.formatCombinedSummary).not.toHaveBeenCalled();
  });
});
