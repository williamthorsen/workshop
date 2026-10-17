import assert from 'node:assert';

import { describe, expect, it } from 'vitest';

import type { RdyChecklist, RdyStagedChecklist } from '../../kits/types.ts';
import { runRdy } from '../runRdy.ts';

describe(runRdy, () => {
  describe('preconditions', () => {
    it('skips all checks when a precondition fails', async () => {
      const checklist: RdyChecklist = {
        name: 'gated',
        preconditions: [{ name: 'pre-fail', check: () => false }],
        checks: [{ name: 'should-skip', check: () => true }],
      };

      const report = await runRdy(checklist);

      expect(report.passed).toBe(false);
      expect(report.results).toHaveLength(2);
      expect(report.results[0]?.status).toBe('failed');
      expect(report.results[1]?.status).toBe('skipped');
    });

    it('assigns precondition skipReason to dependent checks', async () => {
      const checklist: RdyChecklist = {
        name: 'gated',
        preconditions: [{ name: 'pre-fail', check: () => false }],
        checks: [{ name: 'should-skip', check: () => true }],
      };

      const report = await runRdy(checklist);
      const skipped = report.results[1];

      assert.ok(skipped?.status === 'skipped');
      expect(skipped.skipReason).toBe('precondition');
    });

    it('skips nested children of checks under a failing precondition', async () => {
      const checklist: RdyChecklist = {
        name: 'gated-nested',
        preconditions: [{ name: 'pre-fail', check: () => false }],
        checks: [
          {
            name: 'parent',
            check: () => true,
            checks: [{ name: 'child', check: () => true }],
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results).toHaveLength(3);
      const child = report.results[2];
      assert.ok(child?.status === 'skipped');
      expect(child.skipReason).toBe('precondition');
      expect(child.depth).toBe(1);
    });

    it('runs checks when all preconditions pass', async () => {
      const checklist: RdyChecklist = {
        name: 'gated',
        preconditions: [{ name: 'pre-pass', check: () => true }],
        checks: [{ name: 'runs', check: () => true }],
      };

      const report = await runRdy(checklist);

      expect(report.passed).toBe(true);
      expect(report.results).toHaveLength(2);
      expect(report.results[0]?.status).toBe('passed');
      expect(report.results[1]?.status).toBe('passed');
    });

    it('runs checks when a precondition is skipped n/a', async () => {
      const checklist: RdyChecklist = {
        name: 'gated',
        preconditions: [{ name: 'pre-na', check: () => true, skip: () => 'not applicable here' }],
        checks: [{ name: 'runs-anyway', check: () => true }],
      };

      const report = await runRdy(checklist);

      expect(report.passed).toBe(true);
      expect(report.results).toHaveLength(2);
      expect(report.results[0]?.status).toBe('skipped');
      expect(report.results[1]?.name).toBe('runs-anyway');
      expect(report.results[1]?.status).toBe('passed');
    });

    it('runs the checklist when one precondition is n/a and the rest pass', async () => {
      const checklist: RdyChecklist = {
        name: 'gated',
        preconditions: [
          { name: 'pre-na', check: () => true, skip: () => 'not applicable here' },
          { name: 'pre-pass', check: () => true },
        ],
        checks: [{ name: 'runs-anyway', check: () => false }],
      };

      const report = await runRdy(checklist);

      const target = report.results.find((r) => r.name === 'runs-anyway');
      expect(target?.status).toBe('failed');
    });

    it('still skips the checklist when one precondition is n/a and another fails', async () => {
      const checklist: RdyChecklist = {
        name: 'gated',
        preconditions: [
          { name: 'pre-na', check: () => true, skip: () => 'not applicable here' },
          { name: 'pre-fail', check: () => false },
        ],
        checks: [{ name: 'should-skip', check: () => true }],
      };

      const report = await runRdy(checklist);

      expect(report.passed).toBe(false);
      const target = report.results.find((r) => r.name === 'should-skip');
      assert.ok(target?.status === 'skipped');
      expect(target.skipReason).toBe('precondition');
    });

    describe('gating semantics', () => {
      it.each(['error', 'warn', 'recommend'] as const)(
        'gates the checklist when a %s-severity precondition fails',
        async (severity) => {
          const checklist: RdyChecklist = {
            name: 'gated',
            preconditions: [{ name: 'pre-fail', check: () => false, severity }],
            checks: [{ name: 'should-skip', check: () => true }],
          };

          const report = await runRdy(checklist);

          const target = report.results.find((r) => r.name === 'should-skip');
          assert.ok(target?.status === 'skipped');
          expect(target.skipReason).toBe('precondition');
        },
      );

      // Gating and run failure are separate questions: The gate asks whether the checks are worth
      // running at all, and the threshold asks whether what happened is worth failing over.
      it('gates on a precondition whose failure is below the failure threshold, and still passes', async () => {
        const checklist: RdyChecklist = {
          name: 'gated',
          preconditions: [{ name: 'pre-fail', check: () => false, severity: 'recommend' }],
          checks: [{ name: 'should-skip', check: () => false }],
        };

        const report = await runRdy(checklist, { failOn: 'error' });

        expect(report.results[1]?.status).toBe('skipped');
        expect(report.passed).toBe(true);
      });

      it.each(['error', 'warn', 'recommend'] as const)(
        'does not gate when a %s-severity precondition is skipped n/a',
        async (severity) => {
          const checklist: RdyChecklist = {
            name: 'gated',
            preconditions: [{ name: 'pre-na', check: () => false, severity, skip: () => 'not applicable here' }],
            checks: [{ name: 'runs-anyway', check: () => true }],
          };

          const report = await runRdy(checklist);

          expect(report.results.find((r) => r.name === 'runs-anyway')?.status).toBe('passed');
        },
      );

      it('produces no results for checks nested under an n/a-skipped precondition', async () => {
        const checklist: RdyChecklist = {
          name: 'gated',
          preconditions: [
            {
              name: 'pre-na',
              check: () => true,
              skip: () => 'not applicable here',
              checks: [{ name: 'dependent', check: () => true }],
            },
          ],
          checks: [{ name: 'runs-anyway', check: () => true }],
        };

        const report = await runRdy(checklist);

        expect(report.results.map((r) => r.name)).toStrictEqual(['pre-na', 'runs-anyway']);
      });

      it('gates a staged checklist the same way a flat one is gated', async () => {
        const checklist: RdyStagedChecklist = {
          name: 'gated-stages',
          preconditions: [{ name: 'pre-fail', check: () => false, severity: 'recommend' }],
          groups: [[{ name: 'first', check: () => true }], [{ name: 'second', check: () => true }]],
        };

        const report = await runRdy(checklist);

        expect(report.results.filter((r) => r.status === 'skipped').map((r) => r.name)).toStrictEqual([
          'first',
          'second',
        ]);
      });
    });
  });

  describe('skip conditions', () => {
    it('skips a check when skip returns a reason string', async () => {
      const checklist: RdyChecklist = {
        name: 'skip',
        checks: [{ name: 'not-applicable', check: () => true, skip: () => 'tool not installed' }],
      };

      const report = await runRdy(checklist);

      const result = report.results[0];
      assert.ok(result?.status === 'skipped');
      expect(result.skipReason).toBe('n/a');
      expect(result.detail).toBe('tool not installed');
    });

    it('runs a check when skip returns false', async () => {
      const checklist: RdyChecklist = {
        name: 'skip',
        checks: [{ name: 'applicable', check: () => true, skip: () => false }],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.status).toBe('passed');
    });

    it('supports async skip functions', async () => {
      const checklist: RdyChecklist = {
        name: 'skip',
        checks: [{ name: 'async-skip', check: () => true, skip: () => Promise.resolve('skipped async') }],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.status).toBe('skipped');
    });

    it('treats skip function throws as check failures', async () => {
      const checklist: RdyChecklist = {
        name: 'skip',
        checks: [
          {
            name: 'skip-throws',
            check: () => true,
            skip: () => {
              throw new Error('skip error');
            },
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.status).toBe('failed');
      expect(report.results[0]?.error?.message).toBe('skip error');
    });

    it('evaluates skip before running the check function', async () => {
      let checkCalled = false;
      const checklist: RdyChecklist = {
        name: 'skip',
        checks: [
          {
            name: 'skip-first',
            check: () => {
              checkCalled = true;
              return true;
            },
            skip: () => 'skipped',
          },
        ],
      };

      await runRdy(checklist);

      expect(checkCalled).toBe(false);
    });
  });
});
