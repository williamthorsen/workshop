import { describe, expect, it } from 'vitest';

import type { RdyCheck, RdyChecklist } from '../../kits/types.ts';
import { createPragmaLedger } from '../PragmaLedger.ts';
import { runRdy } from '../runRdy.ts';
import { buildingReturning } from '../test-utils/untyped-returns.ts';

describe(runRdy, () => {
  describe('checks built at run time', () => {
    it('runs the children built by a passing parent, each followed by its subtree', async () => {
      const checklist: RdyChecklist = {
        name: 'built',
        checks: [
          {
            name: 'parent',
            check: () => true,
            checks: () =>
              Promise.resolve([
                { name: 'first', check: () => true, checks: [{ name: 'first child', check: () => true }] },
                { name: 'second', check: () => false },
              ]),
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(summarize(report.results)).toStrictEqual([
        ['parent', 'passed', 0],
        ['first', 'passed', 1],
        ['first child', 'passed', 2],
        ['second', 'failed', 1],
      ]);
    });

    it('reports a parent alone when its builder returns no checks', async () => {
      const checklist: RdyChecklist = {
        name: 'built',
        checks: [{ name: 'parent', check: () => true, checks: () => [] }],
      };

      const report = await runRdy(checklist);

      expect(summarize(report.results)).toStrictEqual([['parent', 'passed', 0]]);
    });

    it('suppresses the descendants of a built child as it does those of a declared one', async () => {
      const checklist: RdyChecklist = {
        name: 'built',
        checks: [
          {
            name: 'parent',
            check: () => true,
            checks: () => [
              {
                name: 'inapplicable',
                skip: () => 'not here',
                check: () => true,
                checks: [{ name: 'a', check: () => true }],
              },
              { name: 'failing', check: () => false, checks: [{ name: 'b', check: () => true }] },
            ],
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(summarize(report.results)).toStrictEqual([
        ['parent', 'passed', 0],
        ['inapplicable', 'skipped', 1],
        ['failing', 'failed', 1],
        ['b', 'skipped', 2],
      ]);
    });

    it('builds the children of a built child', async () => {
      const checklist: RdyChecklist = {
        name: 'built',
        checks: [
          {
            name: 'parent',
            check: () => true,
            checks: () => [
              { name: 'child', check: () => true, checks: () => [{ name: 'grandchild', check: () => true }] },
            ],
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(summarize(report.results)).toStrictEqual([
        ['parent', 'passed', 0],
        ['child', 'passed', 1],
        ['grandchild', 'passed', 2],
      ]);
    });

    it('diagnoses a built child that skips as inapplicable', async () => {
      const checklist: RdyChecklist = {
        name: 'built',
        checks: [
          {
            name: 'parent',
            check: () => true,
            checks: () => [{ name: 'masked', skip: () => 'not here', check: () => true }],
          },
        ],
      };

      const report = await runRdy(checklist, { diagnose: true });

      expect(report.diagnoses).toStrictEqual([{ name: 'masked', verdict: 'masked-pass' }]);
    });

    it('records the ids of the checks that it builds', async () => {
      const ledger = createPragmaLedger();
      const checklist: RdyChecklist = {
        name: 'built',
        checks: [
          {
            name: 'parent',
            check: () => true,
            checks: () => [
              {
                name: 'child',
                id: 'child',
                check: () => true,
                checks: [{ name: 'leaf', id: 'leaf', check: () => true }],
              },
            ],
          },
        ],
      };

      await runRdy(checklist, { pragmaLedger: ledger });

      expect(ledger.checkIds().map((ids) => ids.bare)).toStrictEqual(['child', 'leaf']);
    });

    it('reports the parent as an authoring error when its builder throws', async () => {
      const report = await runRdy(
        builtBy(() => {
          throw new Error('no workspaces');
        }),
      );

      expect(summarize(report.results)).toStrictEqual([['parent', 'failed', 0]]);
      expect(report.results[0]?.error?.message).toBe('no workspaces');
      expect(report.results[0]?.severity).toBe('error');
    });

    it('reports the parent as an authoring error when its builder returns something other than an array', async () => {
      const report = await runRdy(builtBy(buildingReturning(undefined)));

      expect(summarize(report.results)).toStrictEqual([['parent', 'failed', 0]]);
      expect(report.results[0]?.error?.message).toContain('checks: expected an array of checks, got undefined');
    });

    it('reports the parent as an authoring error when its builder returns an invalid check', async () => {
      const report = await runRdy(builtBy(buildingReturning([{ name: 'child', check: () => true }, { name: '' }])));

      expect(summarize(report.results)).toStrictEqual([['parent', 'failed', 0]]);
      expect(report.results[0]?.error?.message).toContain('checks[1].name: expected a non-empty string');
    });

    it('does not build the children of a failed parent, reporting the parent alone', async () => {
      let calls = 0;
      const checklist: RdyChecklist = {
        name: 'built',
        checks: [
          {
            name: 'parent',
            check: () => false,
            checks: () => {
              calls += 1;
              return [{ name: 'child', check: () => true }];
            },
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results.map((r) => [r.name, r.status])).toStrictEqual([['parent', 'failed']]);
      expect(calls).toBe(0);
    });

    it('does not build the children of a parent skipped by a failed precondition', async () => {
      let calls = 0;
      const checklist: RdyChecklist = {
        name: 'built',
        preconditions: [{ name: 'gate', check: () => false }],
        checks: [
          {
            name: 'parent',
            check: () => true,
            checks: () => {
              calls += 1;
              return [{ name: 'child', check: () => true }];
            },
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results.map((r) => [r.name, r.status])).toStrictEqual([
        ['gate', 'failed'],
        ['parent', 'skipped'],
      ]);
      expect(calls).toBe(0);
    });
  });
});

// region | Helpers

/** Returns a checklist whose one check, `parent`, passes at `warn` severity and builds its dependents with `checks`. */
function builtBy(checks: RdyCheck['checks']): RdyChecklist {
  return { name: 'built', checks: [{ name: 'parent', check: () => true, severity: 'warn', checks }] };
}

/** Returns each result's name, status, and depth, in report order. */
function summarize(
  results: ReadonlyArray<{ name: string; status: string; depth: number }>,
): Array<[string, string, number]> {
  return results.map((r) => [r.name, r.status, r.depth]);
}

// endregion | Helpers
