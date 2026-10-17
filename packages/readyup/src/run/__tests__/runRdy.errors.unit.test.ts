import assert from 'node:assert';

import { describe, expect, it } from 'vitest';

import type { RdyChecklist } from '../../kits/types.ts';
import { asSeverity } from '../../test-utils/asSeverity.ts';
import { runRdy } from '../runRdy.ts';
import { returning, skipReturning } from '../test-utils/untyped-returns.ts';

describe(runRdy, () => {
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
        'expected a boolean, an object with a boolean "ok" property, or an object with a "findings" array',
      );
    });

    it('overrides a declared severity so that an uninterpretable return cannot be a soft finding', async () => {
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

    it('reports a severity outside the enum rather than dropping the check from every threshold', async () => {
      const checklist: RdyChecklist = {
        name: 'authoring',
        checks: [{ name: 'mistyped', check: () => false, severity: asSeverity('info') }],
      };

      await expect(runRdy(checklist)).rejects.toThrow('Unknown severity "info"');
    });
  });
});
