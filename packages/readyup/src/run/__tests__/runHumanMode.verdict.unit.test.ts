import { beforeEach, describe, expect, it } from 'vitest';

import { kitLoadError } from '../../errors/RdyError.ts';
import { runHumanMode } from '../runHumanMode.ts';
import { createRunFakes, type RunFakes } from '../test-utils/createRunFakes.ts';
import { makeKit, singleKitEntry } from '../test-utils/kit-fixtures.ts';
import { makeFailedResult, makePassedResult, makeSkippedResult } from '../test-utils/result-fixtures.ts';
import { runHuman } from '../test-utils/runHuman.ts';

describe(runHumanMode, () => {
  let fakes: RunFakes;

  beforeEach(() => {
    fakes = createRunFakes();
  });

  describe('resolved thresholds', () => {
    it('passes reportOn to reportRdy', async () => {
      const kit = makeKit();
      fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runHuman(singleKitEntry(['deploy']), { reportOn: 'warn' }, fakes);

      expect(fakes.reportRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reportOn: 'warn' }));
    });
  });

  describe('closing verdict', () => {
    it('ends a passing run with the verdict and the threshold that governed it', async () => {
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      const { stdout } = await runHuman(singleKitEntry(['deploy']), {}, fakes);

      expect(stdout).toMatch(/report output\n\n.*Run passed \(fail-on: error\)\n$/);
    });

    // Under `--fail-on recommend`, the report of a run failing on a recommendation reads like one that passes.
    it('ends a run that fails on a recommendation with a failed verdict', async () => {
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue({
        results: [makeFailedResult('lint', 'recommend')],
        passed: false,
        durationMs: 0,
      });

      const { exitCode, stdout } = await runHuman(singleKitEntry(['deploy']), { failOn: 'recommend' }, fakes);

      expect(exitCode).toBe(1);
      expect(lastLine(stdout)).toContain('Run failed (fail-on: recommend)');
    });

    it('names each kit with its threshold when the kits resolve different thresholds', async () => {
      fakes.loadKit
        .mockResolvedValueOnce({ kit: makeKit({ failOn: 'warn' }), compileTimeVersion: undefined })
        .mockResolvedValueOnce({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      const { stdout } = await runHuman(
        [
          { name: 'audit', source: { path: '.readyup/kits/audit.js' }, checklists: ['deploy'] },
          { name: 'release', source: { path: '.readyup/kits/release.js' }, checklists: ['deploy'] },
        ],
        {},
        fakes,
      );

      expect(lastLine(stdout)).toContain('Run passed (fail-on: error for release; warn for audit)');
    });

    it('ends a run in which a kit did not load with an incomplete verdict', async () => {
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

      expect(lastLine(stdout)).toContain('Run incomplete: 1 kit did not run');
    });

    it('says that a failing check is withheld when the reporting threshold is above the failure threshold', async () => {
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue({
        results: [makePassedResult('build', 'error'), makeFailedResult('lint', 'recommend')],
        passed: false,
        durationMs: 0,
      });

      const { stdout } = await runHuman(singleKitEntry(['deploy']), { failOn: 'recommend', reportOn: 'warn' }, fakes);

      expect(stdout).toContain('Hint: 1 failing check is not shown; rerun with --report-on recommend to show it\n');
    });

    it('does not count a failing check shown as the ancestor of a visible check', async () => {
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue({
        results: [makeFailedResult('lint', 'recommend'), makeSkippedResult('format', 'error', 1)],
        passed: false,
        durationMs: 0,
      });

      const { stdout } = await runHuman(singleKitEntry(['deploy']), { failOn: 'recommend', reportOn: 'warn' }, fakes);

      expect(stdout).not.toContain('not shown');
    });

    it('does not count a withheld failure that does not fail the run', async () => {
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue({
        results: [makeFailedResult('lint', 'recommend')],
        passed: true,
        durationMs: 0,
      });

      const { stdout } = await runHuman(singleKitEntry(['deploy']), { reportOn: 'warn' }, fakes);

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
