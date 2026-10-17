import assert from 'node:assert';

import { describe, expect, it } from 'vitest';

import type { RdyChecklist } from '../../kits/types.ts';
import { runRdy } from '../runRdy.ts';

describe(runRdy, () => {
  describe('quiet', () => {
    it('defaults quiet to false', async () => {
      const checklist: RdyChecklist = {
        name: 'quiet',
        checks: [{ name: 'undeclared', check: () => true }],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.quiet).toBe(false);
    });

    it('sets a declared quiet on a passed result', async () => {
      const checklist: RdyChecklist = {
        name: 'quiet',
        checks: [{ name: 'passes', check: () => true, quiet: true }],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.quiet).toBe(true);
    });

    it('sets a declared quiet on a failed result', async () => {
      const checklist: RdyChecklist = {
        name: 'quiet',
        checks: [{ name: 'fails', check: () => false, quiet: true }],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.quiet).toBe(true);
    });

    it('sets a declared quiet on an n/a-skipped result', async () => {
      const checklist: RdyChecklist = {
        name: 'quiet',
        checks: [{ name: 'not-applicable', check: () => true, quiet: true, skip: () => 'no target' }],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.quiet).toBe(true);
    });

    it('sets a declared quiet on a precondition-skipped result', async () => {
      const checklist: RdyChecklist = {
        name: 'quiet',
        preconditions: [{ name: 'gate', check: () => false }],
        checks: [{ name: 'blocked', check: () => true, quiet: true }],
      };

      const report = await runRdy(checklist);

      const blocked = report.results.find((result) => result.name === 'blocked');
      assert.ok(blocked?.status === 'skipped');
      expect(blocked.quiet).toBe(true);
    });

    it('sets a declared quiet on a check broken rather than failing', async () => {
      const checklist: RdyChecklist = {
        name: 'quiet',
        checks: [
          {
            name: 'throws',
            check: () => {
              throw new Error('boom');
            },
            quiet: true,
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(report.results[0]?.quiet).toBe(true);
      expect(report.results[0]?.severity).toBe('error');
    });

    it('runs a quiet check and gates its children exactly as any other check', async () => {
      let ran = false;
      const checklist: RdyChecklist = {
        name: 'quiet',
        checks: [
          {
            name: 'parent',
            check: () => {
              ran = true;
              return true;
            },
            quiet: true,
            checks: [{ name: 'child', check: () => true }],
          },
        ],
      };

      const report = await runRdy(checklist);

      expect(ran).toBe(true);
      expect(report.results.map((result) => result.name)).toStrictEqual(['parent', 'child']);
      expect(report.results[1]?.quiet).toBe(false);
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
});
