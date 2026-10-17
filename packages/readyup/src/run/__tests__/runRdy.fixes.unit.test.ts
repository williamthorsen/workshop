import assert from 'node:assert';

import { describe, expect, it } from 'vitest';

import { recordSweep } from '../../check-utils/project/sweepRecorder.ts';
import type { RdyCheck, RdyChecklist } from '../../kits/types.ts';
import { runRdy } from '../runRdy.ts';
import { returning, skipReturning } from '../test-utils/untyped-returns.ts';

describe(runRdy, () => {
  describe('fix resolution', () => {
    it('resolves a fix accessor once for a failing check', async () => {
      let hits = 0;
      const checklist: RdyChecklist = {
        name: 'fixes',
        checks: [
          {
            name: 'fails',
            check: () => false,
            get fix() {
              hits++;
              return 'Run the thing';
            },
          },
        ],
      };

      const report = await runRdy(checklist);
      const result = report.results[0];
      assert.ok(result?.status === 'failed');

      expect(hits).toBe(1);
      expect(result.fix).toBe('Run the thing');
    });

    it('leaves a fix accessor unresolved for a check that passes', async () => {
      let hits = 0;
      const checklist: RdyChecklist = {
        name: 'fixes',
        checks: [
          {
            name: 'passes',
            check: () => true,
            get fix() {
              hits++;
              return 'Run the thing';
            },
          },
        ],
      };

      await runRdy(checklist);

      expect(hits).toBe(0);
    });

    it('leaves a fix accessor unresolved for a check skipped as not applicable', async () => {
      let hits = 0;
      const checklist: RdyChecklist = {
        name: 'fixes',
        checks: [
          {
            name: 'skips',
            check: () => false,
            skip: () => 'not applicable here',
            get fix() {
              hits++;
              return 'Run the thing';
            },
          },
        ],
      };

      await runRdy(checklist);

      expect(hits).toBe(0);
    });

    it('leaves a fix accessor unresolved for a check blocked by a failed ancestor', async () => {
      let hits = 0;
      const checklist: RdyChecklist = {
        name: 'fixes',
        checks: [
          {
            name: 'parent-fails',
            check: () => false,
            checks: [
              {
                name: 'blocked',
                check: () => true,
                get fix() {
                  hits++;
                  return 'Run the thing';
                },
              },
            ],
          },
        ],
      };

      await runRdy(checklist);

      expect(hits).toBe(0);
    });

    it('keeps a failure verdict when its fix accessor throws', async () => {
      const checklist: RdyChecklist = {
        name: 'fixes',
        checks: [
          {
            name: 'fails',
            check: () => false,
            severity: 'warn',
            get fix(): string {
              throw new Error('version constants are not initialized yet');
            },
          },
        ],
      };

      const report = await runRdy(checklist);
      const result = report.results[0];
      assert.ok(result?.status === 'failed');

      expect(result.severity).toBe('warn');
      expect(result.error).toBeNull();
      expect(result.fix).toBe('Unresolvable fix: The accessor threw "version constants are not initialized yet"');
    });

    it.each<[string, Pick<RdyCheck, 'check' | 'skip'>]>([
      ['check throws', { check: throwing }],
      ['skip throws', { check: () => true, skip: throwing }],
      ['skip returns an uninterpretable value', { check: () => true, skip: skipReturning(true) }],
      ['check returns an uninterpretable value', { check: returning('yes') }],
    ])('reports no fix and reads no fix accessor when the %s', async (_label, functions) => {
      let hits = 0;
      const checklist: RdyChecklist = {
        name: 'fixes',
        checks: [
          {
            name: 'broken',
            ...functions,
            get fix() {
              hits++;
              return 'Run the thing';
            },
          },
        ],
      };

      const report = await runRdy(checklist);
      const result = report.results[0];
      assert.ok(result?.status === 'failed');

      expect(result.error).not.toBeNull();
      expect(result.fix).toBeNull();
      expect(hits).toBe(0);
    });

    it('keeps a failure verdict when its fix accessor returns a non-string', async () => {
      const checklist: RdyChecklist = {
        name: 'fixes',
        checks: [
          {
            name: 'fails',
            check: () => false,
            severity: 'warn',
            get fix() {
              return asFix(42);
            },
          },
        ],
      };

      const report = await runRdy(checklist);
      const result = report.results[0];
      assert.ok(result?.status === 'failed');

      expect(result.severity).toBe('warn');
      expect(result.fix).toBe('Unresolvable fix: The accessor returned number 42');
    });

    it("reports a failing outcome's fix in place of the check's, leaving its accessor unresolved", async () => {
      let hits = 0;
      const checklist: RdyChecklist = {
        name: 'fixes',
        checks: [
          {
            name: 'fails',
            check: () => ({ ok: false, detail: 'The repo is private', fix: 'Make the repo public' }),
            get fix() {
              hits++;
              return 'Run the thing';
            },
          },
        ],
      };

      const report = await runRdy(checklist);
      const result = report.results[0];
      assert.ok(result?.status === 'failed');

      expect(hits).toBe(0);
      expect(result.detail).toBe('The repo is private');
      expect(result.fix).toBe('Make the repo public');
    });

    it("reports the check's fix for a failing outcome that supplies none", async () => {
      const checklist: RdyChecklist = {
        name: 'fixes',
        checks: [{ name: 'fails', check: () => ({ ok: false, detail: 'The repo is private' }), fix: 'Run the thing' }],
      };

      const report = await runRdy(checklist);
      const result = report.results[0];
      assert.ok(result?.status === 'failed');

      expect(result.fix).toBe('Run the thing');
    });

    it("omits a passing outcome's fix from its result", async () => {
      const checklist: RdyChecklist = {
        name: 'fixes',
        checks: [{ name: 'passes', check: () => ({ ok: true, fix: 'Make the repo public' }) }],
      };

      const report = await runRdy(checklist);
      const result = report.results[0];
      assert.ok(result?.status === 'passed');

      expect(result).not.toHaveProperty('fix');
    });

    it("keeps a failure verdict when its outcome's fix is a non-string, without consulting the check's", async () => {
      let hits = 0;
      const checklist: RdyChecklist = {
        name: 'fixes',
        checks: [
          {
            name: 'fails',
            check: returning({ ok: false, fix: 42 }),
            severity: 'warn',
            get fix() {
              hits++;
              return 'Run the thing';
            },
          },
        ],
      };

      const report = await runRdy(checklist);
      const result = report.results[0];
      assert.ok(result?.status === 'failed');

      expect(hits).toBe(0);
      expect(result.severity).toBe('warn');
      expect(result.error).toBeNull();
      expect(result.fix).toBe('Unresolvable fix: The outcome returned number 42');
    });
  });

  describe('finding outcomes', () => {
    it('derives the verdict, the reason, and the fraction from a check returning findings', async () => {
      const checklist: RdyChecklist = {
        name: 'adoption',
        checks: [
          {
            name: 'no source hand-rolls the idiom',
            check: () => ({
              adoptedCount: 2,
              findings: [
                { line: 12, path: 'fixture/errors.ts', reported: true, symbol: 'describeError' },
                { line: 7, path: 'fixture/report.ts', reported: false },
              ],
            }),
          },
        ],
      };

      const report = await runRdy(checklist);

      const result = report.results[0];
      assert.ok(result !== undefined);
      expect(result.status).toBe('failed');
      expect(result.detail).toBe('describeError (fixture/errors.ts:12)');
      expect(result.progress).toStrictEqual({ count: 4, passedCount: 2, type: 'fraction' });
    });

    it('counts each file examined by the check once, across its skip, its check, and its scanned', async () => {
      const checklist: RdyChecklist = {
        name: 'adoption',
        checks: [
          {
            name: 'no source hand-rolls the idiom',
            skip: () => {
              recordSweep(['src/a.ts', 'src/b.ts']);
              return false;
            },
            check: () => {
              recordSweep(['src/b.ts', 'src/c.ts']);
              return { adoptedCount: 0, findings: [], scanned: ['src/c.ts', 'src/d.ts'] };
            },
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.examinedCount).toBe(4);
    });

    it('counts zero files for a finding check that examined none', async () => {
      const checklist: RdyChecklist = {
        name: 'adoption',
        checks: [{ name: 'no source hand-rolls the idiom', check: () => ({ adoptedCount: 0, findings: [] }) }],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.examinedCount).toBe(0);
    });

    it('reports no examined count for a check that does not return findings', async () => {
      const checklist: RdyChecklist = {
        name: 'adoption',
        checks: [
          {
            name: 'claim',
            check: () => {
              recordSweep(['src/a.ts']);
              return { ok: true };
            },
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.examinedCount).toBeNull();
    });
  });
});

// region | Helpers

/*
 * A kit runs as JavaScript, so its functions return whatever their author wrote and its fields hold
 * whatever they were assigned; neither jiti nor esbuild type-checks any of it. The authoring-error
 * tests exercise exactly the values forbidden by the declared types. The wrappers below restate those
 * values as the types that the declarations promise.
 */
/* eslint-disable @typescript-eslint/consistent-type-assertions */

/** Wraps a value as the string promised by a `fix` accessor. */
function asFix(value: unknown): string {
  return value as string;
}

/* eslint-enable @typescript-eslint/consistent-type-assertions */

/** Throws, as a crashing check or skip function does. */
function throwing(): never {
  throw new Error('boom');
}

// endregion | Helpers
