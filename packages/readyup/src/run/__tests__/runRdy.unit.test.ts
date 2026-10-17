import assert from 'node:assert';

import { describe, expect, it } from 'vitest';

import type { RdyChecklist, RdyStagedChecklist } from '../../kits/types.ts';
import { runRdy } from '../runRdy.ts';

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

      const result = report.results[0];
      assert.ok(result?.status === 'failed');

      expect(report.passed).toBe(false);
      expect(result.ok).toBe(false);
      expect(result.fix).toBe('Do something');
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
    it('takes detail from a passing CheckOutcome', async () => {
      const checklist: RdyChecklist = {
        name: 'outcome',
        checks: [{ name: 'with-detail', check: () => ({ ok: true, detail: 'all files present' }) }],
      };

      const report = await runRdy(checklist);

      expect(report.passed).toBe(true);
      expect(report.results[0]?.status).toBe('passed');
      expect(report.results[0]?.detail).toBe('all files present');
    });

    it('takes progress from a failing CheckOutcome', async () => {
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

    it('takes both detail and progress', async () => {
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

  describe('result shape', () => {
    it('sets null for optional fields on passed results', async () => {
      const checklist: RdyChecklist = {
        name: 'shape',
        checks: [{ name: 'simple', check: () => true }],
      };

      const report = await runRdy(checklist);
      const result = report.results[0];

      expect(result?.detail).toBeNull();
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
      assert.ok(result?.status === 'failed');

      expect(result.detail).toBeNull();
      expect(result.fix).toBeNull();
      expect(result.error).toBeNull();
      expect(result.progress).toBeNull();
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

  describe('check ids', () => {
    it('namespaces an id under the package publishing the kit', async () => {
      const checklist: RdyChecklist = {
        name: 'adoption',
        checks: [{ name: 'claim', id: 'no-instanceof-error', check: () => true }],
      };

      const report = await runRdy(checklist, {
        provenance: {
          kind: 'package',
          packageName: '@williamthorsen/toolbelt.errors',
          version: '1.0.0',
          source: 'npm:@williamthorsen/toolbelt.errors',
        },
      });

      expect(report.results[0]?.id).toBe('toolbelt.errors/no-instanceof-error');
    });

    it('leaves a bare id unchanged for a kit with no publishing package', async () => {
      const checklist: RdyChecklist = {
        name: 'adoption',
        checks: [{ name: 'claim', id: 'no-instanceof-error', check: () => true }],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.id).toBe('no-instanceof-error');
    });

    it('reports no id for a check declaring none', async () => {
      const checklist: RdyChecklist = { name: 'adoption', checks: [{ name: 'claim', check: () => true }] };

      const report = await runRdy(checklist);

      expect(report.results[0]?.id).toBeNull();
    });
  });
});
