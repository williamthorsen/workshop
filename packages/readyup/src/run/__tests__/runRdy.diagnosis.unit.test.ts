import { describe, expect, it } from 'vitest';

import type { RdyChecklist } from '../../kits/types.ts';
import { runRdy } from '../runRdy.ts';
import { returning } from '../test-utils/untyped-returns.ts';

describe(runRdy, () => {
  describe('diagnosis', () => {
    it('reports a skipped check whose check would have passed', async () => {
      const checklist: RdyChecklist = {
        name: 'masked',
        checks: [{ name: 'masked-check', check: () => true, skip: () => 'not applicable' }],
      };

      const report = await runRdy(checklist, { diagnose: true });

      expect(report.diagnoses).toStrictEqual([{ name: 'masked-check', verdict: 'masked-pass' }]);
    });

    it('reads a structured outcome the same way a boolean is read', async () => {
      const checklist: RdyChecklist = {
        name: 'masked',
        checks: [
          { name: 'masked-check', check: () => ({ ok: true }), skip: () => 'not applicable' },
          { name: 'rightly-skipped', check: () => ({ ok: false }), skip: () => 'not applicable' },
        ],
      };

      const report = await runRdy(checklist, { diagnose: true });

      expect(report.diagnoses).toStrictEqual([{ name: 'masked-check', verdict: 'masked-pass' }]);
    });

    it('reports no diagnosis for a skipped check whose check would have failed', async () => {
      const checklist: RdyChecklist = {
        name: 'rightly-skipped',
        checks: [{ name: 'would-fail', check: () => false, skip: () => 'not applicable' }],
      };

      const report = await runRdy(checklist, { diagnose: true });

      expect(report.diagnoses).toStrictEqual([]);
    });

    it('reports a skipped check whose findings cannot be read as inconclusive', async () => {
      const checklist: RdyChecklist = {
        name: 'adoption',
        checks: [{ name: 'malformed', check: returning({ findings: [null] }), skip: () => 'not applicable' }],
      };

      const report = await runRdy(checklist, { diagnose: true });

      expect(report.diagnoses).toHaveLength(1);
      expect(report.diagnoses?.[0]).toMatchObject({ name: 'malformed', verdict: 'inconclusive' });
    });

    it('reads a verdict off a skipped check that would have returned findings', async () => {
      const checklist: RdyChecklist = {
        name: 'adoption',
        checks: [
          {
            name: 'would-fail',
            check: () => ({ findings: [{ line: 1, path: 'fixture/errors.ts', reported: true }] }),
            skip: () => 'not applicable',
          },
          {
            name: 'would-pass',
            check: () => ({ findings: [{ line: 1, path: 'fixture/errors.ts', reported: false }] }),
            skip: () => 'not applicable',
          },
        ],
      };

      const report = await runRdy(checklist, { diagnose: true });

      expect(report.diagnoses).toStrictEqual([{ name: 'would-pass', verdict: 'masked-pass' }]);
    });

    it('reports a check that throws as inconclusive, with its message', async () => {
      const checklist: RdyChecklist = {
        name: 'unreachable',
        checks: [
          {
            name: 'registry-check',
            check: () => {
              throw new Error('fetch failed');
            },
            skip: () => 'offline',
          },
        ],
      };

      const report = await runRdy(checklist, { diagnose: true });

      expect(report.diagnoses).toStrictEqual([
        { name: 'registry-check', verdict: 'inconclusive', reason: 'fetch failed' },
      ]);
    });

    it('reports a check that expresses no verdict as inconclusive', async () => {
      const checklist: RdyChecklist = {
        name: 'broken',
        checks: [{ name: 'no-verdict', check: returning('yes'), skip: () => 'not applicable' }],
      };

      const report = await runRdy(checklist, { diagnose: true });

      expect(report.diagnoses).toStrictEqual([
        {
          name: 'no-verdict',
          verdict: 'inconclusive',
          reason:
            'check() returned string "yes"; expected a boolean, an object with a boolean "ok" property, or an object with a "findings" array.',
        },
      ]);
    });

    it('leaves diagnoses absent and runs no skipped check when diagnosis was not asked for', async () => {
      let checkCalled = false;
      const checklist: RdyChecklist = {
        name: 'masked',
        checks: [
          {
            name: 'masked-check',
            check: () => {
              checkCalled = true;
              return true;
            },
            skip: () => 'not applicable',
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.diagnoses).toBeUndefined();
      expect(checkCalled).toBe(false);
    });

    it('leaves a precondition-blocked check undiagnosed', async () => {
      let checkCalled = false;
      const checklist: RdyChecklist = {
        name: 'blocked',
        preconditions: [{ name: 'gate', check: () => false }],
        checks: [
          {
            name: 'downstream',
            check: () => {
              checkCalled = true;
              return true;
            },
          },
        ],
      };

      const report = await runRdy(checklist, { diagnose: true });

      expect(report.diagnoses).toStrictEqual([]);
      expect(checkCalled).toBe(false);
    });

    it('diagnoses a precondition that skipped n/a', async () => {
      const checklist: RdyChecklist = {
        name: 'gated',
        preconditions: [{ name: 'gate', check: () => true, skip: () => 'not applicable' }],
        checks: [{ name: 'downstream', check: () => true }],
      };

      const report = await runRdy(checklist, { diagnose: true });

      expect(report.diagnoses).toStrictEqual([{ name: 'gate', verdict: 'masked-pass' }]);
    });

    it('leaves the descendants of a skipped check unrun', async () => {
      let childCalled = false;
      const checklist: RdyChecklist = {
        name: 'subtree',
        checks: [
          {
            name: 'parent',
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

      const report = await runRdy(checklist, { diagnose: true });

      expect(report.results.map((r) => r.name)).toStrictEqual(['parent']);
      expect(report.diagnoses).toStrictEqual([{ name: 'parent', verdict: 'masked-pass' }]);
      expect(childCalled).toBe(false);
    });

    it("orders findings by the report's order, not by the order the skips resolved", async () => {
      const checklist: RdyChecklist = {
        name: 'async-skips',
        checks: [
          {
            name: 'slow-skip',
            check: () => true,
            skip: async () => {
              await new Promise((resolve) => setTimeout(resolve, 20));
              return 'not applicable';
            },
          },
          { name: 'fast-skip', check: () => true, skip: () => 'not applicable' },
        ],
      };

      const report = await runRdy(checklist, { diagnose: true });

      expect(report.results.map((r) => r.name)).toStrictEqual(['slow-skip', 'fast-skip']);
      expect(report.diagnoses?.map((d) => d.name)).toStrictEqual(['slow-skip', 'fast-skip']);
    });

    it('leaves statuses, per-check durations, and the verdict identical to an undiagnosed run', async () => {
      const buildChecklist = (): RdyChecklist => ({
        name: 'mixed',
        preconditions: [{ name: 'gate', check: () => true }],
        checks: [
          { name: 'passes', check: () => true },
          { name: 'fails', check: () => false },
          { name: 'masked', check: () => true, skip: () => 'not applicable' },
          { name: 'blocked-parent', check: () => false, checks: [{ name: 'blocked-child', check: () => true }] },
        ],
      });

      const plain = await runRdy(buildChecklist());
      const diagnosed = await runRdy(buildChecklist(), { diagnose: true });

      const shapeOf = (report: Awaited<ReturnType<typeof runRdy>>) =>
        report.results.map((r) => ({
          name: r.name,
          status: r.status,
          severity: r.severity,
          skipReason: r.status === 'skipped' ? r.skipReason : undefined,
        }));

      expect(shapeOf(diagnosed)).toStrictEqual(shapeOf(plain));
      expect(diagnosed.passed).toBe(plain.passed);
      const skipped = diagnosed.results.filter((r) => r.status === 'skipped');
      expect(skipped).not.toHaveLength(0);
      expect(skipped.every((r) => r.durationMs === 0)).toBe(true);
    });
  });
});
