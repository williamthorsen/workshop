import assert from 'node:assert';

import { describe, expect, it } from 'vitest';

import type { RdyChecklist } from '../../kits/types.ts';
import { runRdy } from '../runRdy.ts';

describe(runRdy, () => {
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
