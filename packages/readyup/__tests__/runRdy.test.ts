import assert from 'node:assert';

import { describe, expect, it } from 'vitest';

import { meetsThreshold, runRdy } from '../src/runRdy.ts';
import type {
  CheckReturnValue,
  RdyCheck,
  RdyChecklist,
  RdyStagedChecklist,
  Severity,
  SkipResult,
} from '../src/types.ts';

/*
 * A kit runs as JavaScript, so its functions return whatever their author wrote and its fields hold
 * whatever they were assigned; neither jiti nor esbuild type-checks any of it. The authoring-error
 * tests exercise exactly the values the declared types forbid, so the three wrappers below restate
 * them as the types those declarations promise.
 */
/* eslint-disable @typescript-eslint/consistent-type-assertions */

/** Wrap a value as a check function that returns it. */
function returning(value: unknown): RdyCheck['check'] {
  return () => value as CheckReturnValue;
}

/** Wrap a value as a skip function that returns it. */
function skipReturning(value: unknown): NonNullable<RdyCheck['skip']> {
  return () => value as SkipResult;
}

/** Restate a string as a severity, standing in for a kit that declared one outside the enum. */
function asSeverity(value: string): Severity {
  return value as Severity;
}

/* eslint-enable @typescript-eslint/consistent-type-assertions */

describe(runRdy, () => {
  describe('flat checklists', () => {
    it('marks passing checks as passed', async () => {
      const checklist: RdyChecklist = {
        name: 'basic',
        checks: [{ name: 'always-true', check: () => true }],
      };

      const report = await runRdy(checklist);

      expect(report.passed).toBe(true);
      expect(report.results).toHaveLength(1);
      expect(report.results[0]?.status).toBe('passed');
      expect(report.results[0]?.ok).toBe(true);
      expect(report.results[0]?.severity).toBe('error');
      expect(report.results[0]?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('marks failing checks as failed', async () => {
      const checklist: RdyChecklist = {
        name: 'basic',
        checks: [{ name: 'always-false', check: () => false, fix: 'Do something' }],
      };

      const report = await runRdy(checklist);

      expect(report.passed).toBe(false);
      expect(report.results[0]?.status).toBe('failed');
      expect(report.results[0]?.ok).toBe(false);
      expect(report.results[0]?.fix).toBe('Do something');
    });

    it('captures errors from throwing checks', async () => {
      const checklist: RdyChecklist = {
        name: 'throwing',
        checks: [
          {
            name: 'throws',
            check: () => {
              throw new Error('boom');
            },
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.passed).toBe(false);
      expect(report.results[0]?.status).toBe('failed');
      expect(report.results[0]?.error?.message).toBe('boom');
    });

    it('wraps non-Error thrown values in an Error', async () => {
      const checklist: RdyChecklist = {
        name: 'throwing-string',
        checks: [
          {
            name: 'throws-string',
            check: () => {
              // eslint-disable-next-line @typescript-eslint/only-throw-error
              throw 'a plain string';
            },
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.passed).toBe(false);
      expect(report.results[0]?.status).toBe('failed');
      expect(report.results[0]?.error).toBeInstanceOf(Error);
      expect(report.results[0]?.error?.message).toBe('a plain string');
    });

    it('handles async check functions', async () => {
      const checklist: RdyChecklist = {
        name: 'async',
        checks: [{ name: 'async-true', check: () => Promise.resolve(true) }],
      };

      const report = await runRdy(checklist);

      expect(report.passed).toBe(true);
      expect(report.results[0]?.status).toBe('passed');
    });

    it('runs all checks concurrently', async () => {
      const order: string[] = [];
      const checklist: RdyChecklist = {
        name: 'concurrent',
        checks: [
          {
            name: 'slow',
            check: async () => {
              await new Promise((resolve) => setTimeout(resolve, 20));
              order.push('slow');
              return true;
            },
          },
          {
            name: 'fast',
            check: () => {
              order.push('fast');
              return true;
            },
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.passed).toBe(true);
      expect(order).toStrictEqual(['fast', 'slow']);
    });
  });

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

      // Gating and run failure are separate questions: the gate asks whether the checks are worth
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

  describe('thrown checks', () => {
    it('reports a thrown check at error severity regardless of its declared severity', async () => {
      const checklist: RdyChecklist = {
        name: 'throwing',
        checks: [
          {
            name: 'recommend-throws',
            severity: 'recommend',
            check: () => {
              throw new Error('boom');
            },
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.status).toBe('failed');
      expect(report.results[0]?.severity).toBe('error');
      expect(report.results[0]?.error?.message).toBe('boom');
    });

    it('reports a thrown skip function at error severity regardless of declared severity', async () => {
      const checklist: RdyChecklist = {
        name: 'throwing',
        checks: [
          {
            name: 'recommend-skip-throws',
            severity: 'recommend',
            check: () => true,
            skip: () => {
              throw new Error('skip boom');
            },
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.status).toBe('failed');
      expect(report.results[0]?.severity).toBe('error');
      expect(report.results[0]?.error?.message).toBe('skip boom');
    });

    it('fails the run when a recommend-severity check throws under the default failOn', async () => {
      const checklist: RdyChecklist = {
        name: 'throwing',
        checks: [
          {
            name: 'recommend-throws',
            severity: 'recommend',
            check: () => {
              throw new Error('boom');
            },
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.passed).toBe(false);
    });

    it('leaves sibling results intact when one check throws', async () => {
      const checklist: RdyChecklist = {
        name: 'throwing',
        checks: [
          {
            name: 'throws',
            check: () => {
              throw new Error('boom');
            },
          },
          { name: 'sibling-passes', check: () => true },
          { name: 'sibling-fails', check: () => false },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results.map((r) => ({ name: r.name, status: r.status }))).toStrictEqual([
        { name: 'throws', status: 'failed' },
        { name: 'sibling-passes', status: 'passed' },
        { name: 'sibling-fails', status: 'failed' },
      ]);
    });

    it('escalates only the thrown check, leaving descendant severities untouched', async () => {
      const checklist: RdyChecklist = {
        name: 'throwing',
        checks: [
          {
            name: 'parent-throws',
            severity: 'recommend',
            check: () => {
              throw new Error('boom');
            },
            checks: [{ name: 'child', check: () => true, severity: 'warn' }],
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.severity).toBe('error');
      expect(report.results[1]?.name).toBe('child');
      expect(report.results[1]?.status).toBe('skipped');
      expect(report.results[1]?.severity).toBe('warn');
    });
  });

  describe('staged checklists', () => {
    it('skips subsequent groups when a group fails', async () => {
      const checklist: RdyStagedChecklist = {
        name: 'staged',
        groups: [[{ name: 'g1-fail', check: () => false }], [{ name: 'g2-skip', check: () => true }]],
      };

      const report = await runRdy(checklist);

      expect(report.passed).toBe(false);
      expect(report.results).toHaveLength(2);
      expect(report.results[0]?.status).toBe('failed');
      expect(report.results[1]?.status).toBe('skipped');
    });

    it('runs all groups when earlier groups pass', async () => {
      const checklist: RdyStagedChecklist = {
        name: 'staged',
        groups: [[{ name: 'g1-pass', check: () => true }], [{ name: 'g2-pass', check: () => true }]],
      };

      const report = await runRdy(checklist);

      expect(report.passed).toBe(true);
      expect(report.results).toHaveLength(2);
      expect(report.results.every((r) => r.status === 'passed')).toBe(true);
    });

    it('skips all groups when preconditions fail', async () => {
      const checklist: RdyStagedChecklist = {
        name: 'staged-gated',
        preconditions: [{ name: 'pre-fail', check: () => false }],
        groups: [[{ name: 'g1', check: () => true }], [{ name: 'g2', check: () => true }]],
      };

      const report = await runRdy(checklist);

      expect(report.passed).toBe(false);
      expect(report.results).toHaveLength(3);
      expect(report.results[0]?.status).toBe('failed');
      expect(report.results[1]?.status).toBe('skipped');
      expect(report.results[2]?.status).toBe('skipped');
    });

    it('continues staged progression when failure is below failOn threshold', async () => {
      const checklist: RdyStagedChecklist = {
        name: 'staged-threshold',
        groups: [
          [{ name: 'g1-warn-fail', check: () => false, severity: 'warn' }],
          [{ name: 'g2-runs', check: () => true }],
        ],
      };

      const report = await runRdy(checklist, { failOn: 'error' });

      expect(report.passed).toBe(true);
      expect(report.results).toHaveLength(2);
      expect(report.results[0]?.status).toBe('failed');
      expect(report.results[1]?.status).toBe('passed');
    });

    it('halts staged progression when failure meets failOn threshold', async () => {
      const checklist: RdyStagedChecklist = {
        name: 'staged-threshold',
        groups: [
          [{ name: 'g1-warn-fail', check: () => false, severity: 'warn' }],
          [{ name: 'g2-skipped', check: () => true }],
        ],
      };

      const report = await runRdy(checklist, { failOn: 'warn' });

      expect(report.passed).toBe(false);
      expect(report.results).toHaveLength(2);
      expect(report.results[0]?.status).toBe('failed');
      expect(report.results[1]?.status).toBe('skipped');
    });

    it('executes nested checks within a staged group', async () => {
      const checklist: RdyStagedChecklist = {
        name: 'staged-nested',
        groups: [
          [
            {
              name: 'g1-parent',
              check: () => true,
              checks: [{ name: 'g1-child', check: () => true }],
            },
          ],
          [{ name: 'g2-runs', check: () => true }],
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results).toHaveLength(3);
      expect(report.results[0]?.name).toBe('g1-parent');
      expect(report.results[0]?.depth).toBe(0);
      expect(report.results[1]?.name).toBe('g1-child');
      expect(report.results[1]?.depth).toBe(1);
      expect(report.results[2]?.name).toBe('g2-runs');
      expect(report.results[2]?.status).toBe('passed');
    });

    it('does not halt subsequent groups when only a nested child fails', async () => {
      const checklist: RdyStagedChecklist = {
        name: 'staged-nested-child-fail',
        groups: [
          [
            {
              name: 'g1-parent',
              check: () => true,
              checks: [{ name: 'g1-child-fail', check: () => false }],
            },
          ],
          [{ name: 'g2-runs', check: () => true }],
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results).toHaveLength(3);
      expect(report.results[1]?.name).toBe('g1-child-fail');
      expect(report.results[1]?.status).toBe('failed');
      expect(report.results[2]?.name).toBe('g2-runs');
      expect(report.results[2]?.status).toBe('passed');
    });

    it('does not halt subsequent groups when nested child fails below failOn', async () => {
      const checklist: RdyStagedChecklist = {
        name: 'staged-nested-threshold',
        groups: [
          [
            {
              name: 'g1-parent',
              check: () => true,
              checks: [{ name: 'g1-child-warn', check: () => false, severity: 'warn' }],
            },
          ],
          [{ name: 'g2-runs', check: () => true }],
        ],
      };

      const report = await runRdy(checklist, { failOn: 'error' });

      expect(report.results[2]?.name).toBe('g2-runs');
      expect(report.results[2]?.status).toBe('passed');
    });
  });

  describe('structured check outcomes', () => {
    it('carries detail from a passing CheckOutcome', async () => {
      const checklist: RdyChecklist = {
        name: 'outcome',
        checks: [{ name: 'with-detail', check: () => ({ ok: true, detail: 'all files present' }) }],
      };

      const report = await runRdy(checklist);

      expect(report.passed).toBe(true);
      expect(report.results[0]?.status).toBe('passed');
      expect(report.results[0]?.detail).toBe('all files present');
    });

    it('carries progress from a failing CheckOutcome', async () => {
      const checklist: RdyChecklist = {
        name: 'outcome',
        checks: [
          {
            name: 'with-progress',
            check: () => ({ ok: false, progress: { type: 'fraction', passedCount: 7, count: 10 } }),
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.passed).toBe(false);
      expect(report.results[0]?.status).toBe('failed');
      expect(report.results[0]?.progress).toStrictEqual({ type: 'fraction', passedCount: 7, count: 10 });
    });

    it('carries both detail and progress', async () => {
      const checklist: RdyChecklist = {
        name: 'outcome',
        checks: [
          {
            name: 'full-outcome',
            check: () => ({ ok: false, detail: 'missing deps', progress: { type: 'percent', percent: 85 } }),
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.detail).toBe('missing deps');
      expect(report.results[0]?.progress).toStrictEqual({ type: 'percent', percent: 85 });
    });

    it('sets null for detail and progress on skipped results', async () => {
      const checklist: RdyChecklist = {
        name: 'outcome',
        preconditions: [{ name: 'pre-fail', check: () => false }],
        checks: [{ name: 'skipped-check', check: () => ({ ok: true, detail: 'should not appear' }) }],
      };

      const report = await runRdy(checklist);

      const skipped = report.results.find((r) => r.status === 'skipped');
      expect(skipped?.detail).toBeNull();
      expect(skipped?.progress).toBeNull();
    });

    it('handles async CheckOutcome', async () => {
      const checklist: RdyChecklist = {
        name: 'async-outcome',
        checks: [{ name: 'async-detail', check: () => Promise.resolve({ ok: true, detail: 'async info' }) }],
      };

      const report = await runRdy(checklist);

      expect(report.passed).toBe(true);
      expect(report.results[0]?.detail).toBe('async info');
    });
  });

  describe('severity', () => {
    it('defaults severity to error', async () => {
      const checklist: RdyChecklist = {
        name: 'severity',
        checks: [{ name: 'default', check: () => true }],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.severity).toBe('error');
    });

    it('uses check-level severity when provided', async () => {
      const checklist: RdyChecklist = {
        name: 'severity',
        checks: [{ name: 'warn-check', check: () => true, severity: 'warn' }],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.severity).toBe('warn');
    });

    it('falls back to defaultSeverity from options', async () => {
      const checklist: RdyChecklist = {
        name: 'severity',
        checks: [{ name: 'no-severity', check: () => true }],
      };

      const report = await runRdy(checklist, { defaultSeverity: 'recommend' });

      expect(report.results[0]?.severity).toBe('recommend');
    });

    it('prefers check-level severity over defaultSeverity', async () => {
      const checklist: RdyChecklist = {
        name: 'severity',
        checks: [{ name: 'explicit', check: () => true, severity: 'error' }],
      };

      const report = await runRdy(checklist, { defaultSeverity: 'recommend' });

      expect(report.results[0]?.severity).toBe('error');
    });
  });

  describe('failure threshold', () => {
    it('passes when a failed check is below the failOn threshold', async () => {
      const checklist: RdyChecklist = {
        name: 'threshold',
        checks: [{ name: 'warn-fail', check: () => false, severity: 'warn' }],
      };

      const report = await runRdy(checklist, { failOn: 'error' });

      expect(report.passed).toBe(true);
    });

    it('fails when a failed check meets the failOn threshold', async () => {
      const checklist: RdyChecklist = {
        name: 'threshold',
        checks: [{ name: 'warn-fail', check: () => false, severity: 'warn' }],
      };

      const report = await runRdy(checklist, { failOn: 'warn' });

      expect(report.passed).toBe(false);
    });

    it('fails when a failed check exceeds the failOn threshold', async () => {
      const checklist: RdyChecklist = {
        name: 'threshold',
        checks: [{ name: 'error-fail', check: () => false, severity: 'error' }],
      };

      const report = await runRdy(checklist, { failOn: 'recommend' });

      expect(report.passed).toBe(false);
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

  describe('authoring errors', () => {
    it.each([
      ['a string', 'yes', 'check() returned string "yes"'],
      ['a number', 1, 'check() returned number 1'],
      ['an object whose ok is not a boolean', { ok: 'true' }, 'check() returned object {"ok":"true"}'],
      ['undefined', undefined, 'check() returned undefined'],
      ['null', null, 'check() returned null'],
      ['an array', [true], 'check() returned array [true]'],
    ])('fails a check returning %s, naming what came back', async (_label, value, expected) => {
      const checklist: RdyChecklist = { name: 'authoring', checks: [{ name: 'broken', check: returning(value) }] };

      const report = await runRdy(checklist);

      expect(report.results[0]?.status).toBe('failed');
      expect(report.results[0]?.error?.message).toContain(expected);
    });

    it('names what a check was supposed to return', async () => {
      const checklist: RdyChecklist = { name: 'authoring', checks: [{ name: 'broken', check: returning('yes') }] };

      const report = await runRdy(checklist);

      expect(report.results[0]?.error?.message).toContain(
        'expected a boolean or an object with a boolean "ok" property',
      );
    });

    it('overrides a declared severity so an uninterpretable return cannot be a soft finding', async () => {
      const checklist: RdyChecklist = {
        name: 'authoring',
        checks: [{ name: 'broken', check: returning('yes'), severity: 'recommend' }],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.severity).toBe('error');
      expect(report.passed).toBe(false);
    });

    it('skips descendants of a check that returned an uninterpretable value', async () => {
      const checklist: RdyChecklist = {
        name: 'authoring',
        checks: [{ name: 'broken', check: returning(1), checks: [{ name: 'child', check: () => true }] }],
      };

      const report = await runRdy(checklist);

      const child = report.results[1];
      assert.ok(child?.status === 'skipped');
      expect(child.name).toBe('child');
      expect(child.skipReason).toBe('precondition');
    });

    it.each([
      ['true', true, 'skip() returned boolean true'],
      ['a number', 0, 'skip() returned number 0'],
      ['undefined', undefined, 'skip() returned undefined'],
    ])('fails a check whose skip returns %s, naming what came back', async (_label, value, expected) => {
      const checklist: RdyChecklist = {
        name: 'authoring',
        checks: [{ name: 'broken-skip', check: () => true, skip: skipReturning(value) }],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.status).toBe('failed');
      expect(report.results[0]?.severity).toBe('error');
      expect(report.results[0]?.error?.message).toContain(expected);
    });

    it('names what a skip function was supposed to return', async () => {
      const checklist: RdyChecklist = {
        name: 'authoring',
        checks: [{ name: 'broken-skip', check: () => true, skip: skipReturning(true) }],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.error?.message).toContain(
        'expected false to run the check, or a reason string to skip it',
      );
    });

    it('does not run the check when skip returned an uninterpretable value', async () => {
      let checkCalled = false;
      const checklist: RdyChecklist = {
        name: 'authoring',
        checks: [
          {
            name: 'broken-skip',
            check: () => {
              checkCalled = true;
              return true;
            },
            skip: skipReturning(true),
          },
        ],
      };

      await runRdy(checklist);

      expect(checkCalled).toBe(false);
    });

    it('skips descendants of a check whose skip returned an uninterpretable value', async () => {
      const checklist: RdyChecklist = {
        name: 'authoring',
        checks: [
          {
            name: 'broken-skip',
            check: () => true,
            skip: skipReturning(true),
            checks: [{ name: 'child', check: () => true }],
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results[1]?.name).toBe('child');
      expect(report.results[1]?.status).toBe('skipped');
    });

    it('surfaces a severity outside the enum rather than dropping the check from every threshold', async () => {
      const checklist: RdyChecklist = {
        name: 'authoring',
        checks: [{ name: 'mistyped', check: () => false, severity: asSeverity('info') }],
      };

      await expect(runRdy(checklist)).rejects.toThrow('Unknown severity "info"');
    });
  });

  describe('result shape', () => {
    it('sets null for optional fields on passed results', async () => {
      const checklist: RdyChecklist = {
        name: 'shape',
        checks: [{ name: 'simple', check: () => true }],
      };

      const report = await runRdy(checklist);
      const result = report.results[0];

      expect(result?.detail).toBeNull();
      expect(result?.fix).toBeNull();
      expect(result?.error).toBeNull();
      expect(result?.progress).toBeNull();
    });

    it('sets null for optional fields on failed results without extras', async () => {
      const checklist: RdyChecklist = {
        name: 'shape',
        checks: [{ name: 'simple-fail', check: () => false }],
      };

      const report = await runRdy(checklist);
      const result = report.results[0];

      expect(result?.detail).toBeNull();
      expect(result?.fix).toBeNull();
      expect(result?.error).toBeNull();
      expect(result?.progress).toBeNull();
    });
  });

  it('computes total duration', async () => {
    const checklist: RdyChecklist = {
      name: 'timing',
      checks: [{ name: 'quick', check: () => true }],
    };

    const report = await runRdy(checklist);

    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });

  describe('nested checks', () => {
    it('executes children of a passing check', async () => {
      const checklist: RdyChecklist = {
        name: 'nested',
        checks: [
          {
            name: 'parent',
            check: () => true,
            checks: [{ name: 'child', check: () => true }],
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results).toHaveLength(2);
      expect(report.results[0]?.name).toBe('parent');
      expect(report.results[0]?.status).toBe('passed');
      expect(report.results[0]?.depth).toBe(0);
      expect(report.results[1]?.name).toBe('child');
      expect(report.results[1]?.status).toBe('passed');
      expect(report.results[1]?.depth).toBe(1);
    });

    it('skips children of a failed check with precondition reason', async () => {
      const checklist: RdyChecklist = {
        name: 'nested',
        checks: [
          {
            name: 'parent',
            check: () => false,
            checks: [{ name: 'child', check: () => true }],
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results).toHaveLength(2);
      expect(report.results[0]?.status).toBe('failed');
      expect(report.results[1]?.name).toBe('child');
      const child = report.results[1];
      assert.ok(child?.status === 'skipped');
      expect(child.skipReason).toBe('precondition');
      expect(child.depth).toBe(1);
    });

    it('emits no results for descendants of an n/a-skipped check', async () => {
      const checklist: RdyChecklist = {
        name: 'nested',
        checks: [
          {
            name: 'parent',
            check: () => true,
            skip: () => 'not applicable',
            checks: [{ name: 'child', check: () => true }],
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results).toHaveLength(1);
      const parent = report.results[0];
      assert.ok(parent?.status === 'skipped');
      expect(parent.skipReason).toBe('n/a');
    });

    it('emits exactly one result for an n/a-skipped check with a multi-level subtree', async () => {
      const checklist: RdyChecklist = {
        name: 'nested',
        checks: [
          {
            name: 'na-parent',
            check: () => true,
            skip: () => 'not applicable',
            checks: [
              {
                name: 'child-a',
                check: () => true,
                checks: [{ name: 'grandchild-a', check: () => true }],
              },
              {
                name: 'child-b',
                check: () => true,
                checks: [{ name: 'grandchild-b', check: () => true }],
              },
            ],
          },
          { name: 'next-sibling', check: () => true },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results.map((r) => r.name)).toStrictEqual(['na-parent', 'next-sibling']);
    });

    it('does not run descendants of an n/a-skipped check', async () => {
      let childCalled = false;
      const checklist: RdyChecklist = {
        name: 'nested',
        checks: [
          {
            name: 'na-parent',
            check: () => true,
            skip: () => 'not applicable',
            checks: [
              {
                name: 'child',
                check: () => {
                  childCalled = true;
                  return true;
                },
              },
            ],
          },
        ],
      };

      await runRdy(checklist);

      expect(childCalled).toBe(false);
    });

    it('emits one result per descendant of a precondition-skipped check', async () => {
      const checklist: RdyChecklist = {
        name: 'nested',
        checks: [
          {
            name: 'failing-parent',
            check: () => false,
            checks: [
              {
                name: 'child-a',
                check: () => true,
                checks: [{ name: 'grandchild-a', check: () => true }],
              },
              { name: 'child-b', check: () => true },
            ],
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results.map((r) => ({ name: r.name, depth: r.depth }))).toStrictEqual([
        { name: 'failing-parent', depth: 0 },
        { name: 'child-a', depth: 1 },
        { name: 'grandchild-a', depth: 2 },
        { name: 'child-b', depth: 1 },
      ]);
    });

    it('produces depth-first ordering for multi-level nesting', async () => {
      const checklist: RdyChecklist = {
        name: 'nested',
        checks: [
          {
            name: 'A',
            check: () => true,
            checks: [
              { name: 'A1', check: () => true },
              { name: 'A2', check: () => true },
            ],
          },
          {
            name: 'B',
            check: () => true,
            checks: [
              { name: 'B1', check: () => true },
              { name: 'B2', check: () => true },
            ],
          },
        ],
      };

      const report = await runRdy(checklist);
      const names = report.results.map((r) => r.name);

      expect(names).toStrictEqual(['A', 'A1', 'A2', 'B', 'B1', 'B2']);
    });

    it('assigns correct depth values at three levels', async () => {
      const checklist: RdyChecklist = {
        name: 'nested',
        checks: [
          {
            name: 'L0',
            check: () => true,
            checks: [
              {
                name: 'L1',
                check: () => true,
                checks: [{ name: 'L2', check: () => true }],
              },
            ],
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results.map((r) => ({ name: r.name, depth: r.depth }))).toStrictEqual([
        { name: 'L0', depth: 0 },
        { name: 'L1', depth: 1 },
        { name: 'L2', depth: 2 },
      ]);
    });

    it('recursively skips all descendants when parent fails', async () => {
      const checklist: RdyChecklist = {
        name: 'nested',
        checks: [
          {
            name: 'parent',
            check: () => false,
            checks: [
              {
                name: 'child',
                check: () => true,
                checks: [{ name: 'grandchild', check: () => true }],
              },
            ],
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results).toHaveLength(3);
      expect(report.results[1]?.status).toBe('skipped');
      expect(report.results[2]?.status).toBe('skipped');
      expect(report.results[2]?.depth).toBe(2);
    });

    it('includes nested results in pass/fail determination', async () => {
      const checklist: RdyChecklist = {
        name: 'nested',
        checks: [
          {
            name: 'parent',
            check: () => true,
            checks: [{ name: 'child-fails', check: () => false }],
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.passed).toBe(false);
    });

    it('defaults depth to 0 for top-level checks without nesting', async () => {
      const checklist: RdyChecklist = {
        name: 'flat',
        checks: [{ name: 'top-level', check: () => true }],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.depth).toBe(0);
    });
  });
});

describe(meetsThreshold, () => {
  it.each([
    { severity: 'error', threshold: 'error', expected: true },
    { severity: 'error', threshold: 'warn', expected: true },
    { severity: 'error', threshold: 'recommend', expected: true },
    { severity: 'warn', threshold: 'error', expected: false },
    { severity: 'warn', threshold: 'warn', expected: true },
    { severity: 'warn', threshold: 'recommend', expected: true },
    { severity: 'recommend', threshold: 'error', expected: false },
    { severity: 'recommend', threshold: 'warn', expected: false },
    { severity: 'recommend', threshold: 'recommend', expected: true },
  ] as const)('returns $expected for severity=$severity, threshold=$threshold', ({ severity, threshold, expected }) => {
    expect(meetsThreshold(severity, threshold)).toBe(expected);
  });

  it('throws on a severity outside the enum', () => {
    expect(() => meetsThreshold(asSeverity('info'), 'error')).toThrow(
      'Unknown severity "info". Expected one of: error, warn, recommend.',
    );
  });

  it('throws on a threshold outside the enum', () => {
    expect(() => meetsThreshold('error', asSeverity('info'))).toThrow('Unknown severity threshold "info"');
  });
});
