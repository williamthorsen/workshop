import { describe, expect, it } from 'vitest';

import type { RdyChecklist } from '../../kits/types.ts';
import { runRdy } from '../runRdy.ts';

describe(runRdy, () => {
  describe('checks built at run time', () => {
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
