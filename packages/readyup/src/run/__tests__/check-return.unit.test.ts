import { describe, expect, it } from 'vitest';

import type { RdyCheck } from '../../kits/types.ts';
import { resolveCheckReturn } from '../check-return.ts';

const CHECK: RdyCheck = { name: 'findings-check', check: () => true };

// A path that names no file, so that no pragma can suppress the finding.
const FINDING = { line: 3, path: 'missing/source.ts', reported: true };

describe(resolveCheckReturn, () => {
  it.each([
    [
      'a null finding',
      { findings: [null] },
      'check() returned findings[0] as null; expected an object with string "path", number "line", and boolean "reported".',
    ],
    [
      'a finding without "reported"',
      { findings: [FINDING, { line: 3, path: 'missing/source.ts' }] },
      'check() returned findings[1].reported as undefined; expected a boolean.',
    ],
    [
      'a truthy non-boolean "reported"',
      { findings: [{ ...FINDING, reported: 'yes' }] },
      'check() returned findings[0].reported as string "yes"; expected a boolean.',
    ],
    [
      'a non-string "path"',
      { findings: [{ ...FINDING, path: 7 }] },
      'check() returned findings[0].path as number 7; expected a string.',
    ],
    [
      'a non-number "line"',
      { findings: [{ ...FINDING, line: '3' }] },
      'check() returned findings[0].line as string "3"; expected a number.',
    ],
    [
      'a non-string "symbol"',
      { findings: [{ ...FINDING, symbol: 3 }] },
      'check() returned findings[0].symbol as number 3; expected a string or nothing.',
    ],
    [
      'a non-number "adoptedCount"',
      { adoptedCount: '3', findings: [] },
      'check() returned adoptedCount as string "3"; expected a number or nothing.',
    ],
    [
      'a non-array "scanned"',
      { findings: [], scanned: 'src/a.ts' },
      'check() returned scanned as string "src/a.ts"; expected an array of strings or nothing.',
    ],
    [
      'a non-string entry in "scanned"',
      { findings: [], scanned: ['src/a.ts', null] },
      'check() returned scanned[1] as null; expected a string.',
    ],
  ])('throws for %s, naming the field and the expected type', (_label, raw, expected) => {
    expect(() => resolveCheckReturn(raw, CHECK, undefined)).toThrow(expected);
  });

  it('names the first offending field when several are malformed', () => {
    const raw = { adoptedCount: 'x', findings: [{ ...FINDING, line: null, reported: 1 }] };

    expect(() => resolveCheckReturn(raw, CHECK, undefined)).toThrow('findings[0].line');
  });

  it('resolves well-formed findings into an outcome', () => {
    const raw = {
      adoptedCount: 2,
      findings: [
        { ...FINDING, symbol: 'build' },
        { ...FINDING, line: 9, reported: false },
      ],
      scanned: ['missing/source.ts'],
    };

    expect(resolveCheckReturn(raw, CHECK, undefined)).toStrictEqual({
      detail: 'build (missing/source.ts:3)',
      ok: false,
      progress: { count: 4, passedCount: 2, type: 'fraction' },
    });
  });

  it('resolves findings that omit every optional field', () => {
    expect(resolveCheckReturn({ findings: [{ ...FINDING, reported: false }] }, CHECK, undefined)).toStrictEqual({
      ok: true,
      progress: undefined,
    });
  });

  it('returns a value that is not a set of findings as it came', () => {
    const raw = { ok: true };

    expect(resolveCheckReturn(raw, CHECK, undefined)).toBe(raw);
  });
});
