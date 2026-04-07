import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { assertIsRdyKit } from '../src/assertIsRdyKit.ts';

describe(assertIsRdyKit, () => {
  it('throws when input is not an object', () => {
    expect(() => assertIsRdyKit('string')).toThrow(ZodError);
  });

  it('throws when input is an array', () => {
    expect(() => assertIsRdyKit([])).toThrow(ZodError);
  });

  it('throws when checklists is missing', () => {
    expect(() => assertIsRdyKit({})).toThrow(ZodError);
  });

  it('throws when a checklist has neither checks nor groups', () => {
    expect(() => assertIsRdyKit({ checklists: [{ name: 'bad' }] })).toThrow(ZodError);
  });

  it('throws when a checklist has both checks and groups', () => {
    try {
      assertIsRdyKit({ checklists: [{ name: 'bad', checks: [], groups: [] }] });
      expect.unreachable('Expected ZodError');
    } catch (error) {
      if (!(error instanceof ZodError)) throw error;
      expect(error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: "Checklist cannot have both 'checks' and 'groups'" }),
        ]),
      );
    }
  });

  it('throws when a checklist entry is not an object', () => {
    try {
      assertIsRdyKit({ checklists: ['not-an-object'] });
      expect.unreachable('Expected ZodError');
    } catch (error) {
      if (!(error instanceof ZodError)) throw error;
      expect(error.issues[0]?.path).toEqual(expect.arrayContaining(['checklists', 0]));
    }
  });

  it('throws when a checklist name is missing', () => {
    try {
      assertIsRdyKit({ checklists: [{ checks: [] }] });
      expect.unreachable('Expected ZodError');
    } catch (error) {
      if (!(error instanceof ZodError)) throw error;
      const nameIssue = error.issues
        .flatMap((i) => ('errors' in i ? i.errors.flat() : [i]))
        .find((i) => i.path.includes('name'));
      expect(nameIssue).toBeDefined();
    }
  });

  it('throws when a checklist name is empty', () => {
    try {
      assertIsRdyKit({ checklists: [{ name: '', checks: [] }] });
      expect.unreachable('Expected ZodError');
    } catch (error) {
      if (!(error instanceof ZodError)) throw error;
      const nameIssue = error.issues
        .flatMap((i) => ('errors' in i ? i.errors.flat() : [i]))
        .find((i) => i.path.includes('name'));
      expect(nameIssue).toBeDefined();
    }
  });

  it('accepts a valid kit with flat checklists', () => {
    expect(() =>
      assertIsRdyKit({
        checklists: [{ name: 'test', checks: [{ name: 'a', check: () => true }] }],
      }),
    ).not.toThrow();
  });

  it('accepts a valid kit with staged checklists', () => {
    expect(() =>
      assertIsRdyKit({
        checklists: [{ name: 'test', groups: [[{ name: 'a', check: () => true }]] }],
      }),
    ).not.toThrow();
  });

  it('accepts a valid kit with suites', () => {
    expect(() =>
      assertIsRdyKit({
        checklists: [{ name: 'lint', checks: [] }],
        suites: { ci: ['lint'] },
      }),
    ).not.toThrow();
  });

  it('accepts a kit without suites', () => {
    expect(() =>
      assertIsRdyKit({
        checklists: [{ name: 'test', checks: [] }],
      }),
    ).not.toThrow();
  });

  it('throws when suites is not an object', () => {
    expect(() =>
      assertIsRdyKit({
        checklists: [{ name: 'test', checks: [] }],
        suites: 'not-a-record',
      }),
    ).toThrow(ZodError);
  });

  it('throws when a suite value is not an array', () => {
    expect(() =>
      assertIsRdyKit({
        checklists: [{ name: 'test', checks: [] }],
        suites: { ci: 'not-an-array' },
      }),
    ).toThrow(ZodError);
  });

  it('throws when a suite contains non-string entries', () => {
    expect(() =>
      assertIsRdyKit({
        checklists: [{ name: 'test', checks: [] }],
        suites: { ci: [42] },
      }),
    ).toThrow(ZodError);
  });

  it('accepts a valid fixLocation', () => {
    expect(() =>
      assertIsRdyKit({
        checklists: [{ name: 'test', checks: [] }],
        fixLocation: 'inline',
      }),
    ).not.toThrow();
  });

  it('throws when fixLocation is invalid', () => {
    expect(() =>
      assertIsRdyKit({
        checklists: [{ name: 'test', checks: [] }],
        fixLocation: 'WRONG',
      }),
    ).toThrow(ZodError);
  });

  it('throws when fixLocation uses old uppercase casing', () => {
    expect(() =>
      assertIsRdyKit({
        checklists: [{ name: 'test', checks: [] }],
        fixLocation: 'INLINE',
      }),
    ).toThrow(ZodError);
  });

  it('accepts valid defaultSeverity', () => {
    expect(() =>
      assertIsRdyKit({
        checklists: [{ name: 'test', checks: [] }],
        defaultSeverity: 'warn',
      }),
    ).not.toThrow();
  });

  it('throws when defaultSeverity is invalid', () => {
    expect(() =>
      assertIsRdyKit({
        checklists: [{ name: 'test', checks: [] }],
        defaultSeverity: 'critical',
      }),
    ).toThrow(ZodError);
  });

  it('accepts valid failOn', () => {
    expect(() =>
      assertIsRdyKit({
        checklists: [{ name: 'test', checks: [] }],
        failOn: 'recommend',
      }),
    ).not.toThrow();
  });

  it('throws when failOn is invalid', () => {
    expect(() =>
      assertIsRdyKit({
        checklists: [{ name: 'test', checks: [] }],
        failOn: 'none',
      }),
    ).toThrow(ZodError);
  });

  it('accepts valid reportOn', () => {
    expect(() =>
      assertIsRdyKit({
        checklists: [{ name: 'test', checks: [] }],
        reportOn: 'error',
      }),
    ).not.toThrow();
  });

  it('throws when reportOn is invalid', () => {
    expect(() =>
      assertIsRdyKit({
        checklists: [{ name: 'test', checks: [] }],
        reportOn: 'verbose',
      }),
    ).toThrow(ZodError);
  });

  it('accepts a kit with all new fields', () => {
    expect(() =>
      assertIsRdyKit({
        checklists: [{ name: 'test', checks: [] }],
        defaultSeverity: 'warn',
        failOn: 'warn',
        reportOn: 'recommend',
        fixLocation: 'end',
      }),
    ).not.toThrow();
  });
});
