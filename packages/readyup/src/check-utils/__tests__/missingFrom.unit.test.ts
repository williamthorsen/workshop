import { describe, expect, it } from 'vitest';

import { missingFrom as missingFromBarrel } from '../index.ts';
import { missingFrom } from '../missingFrom.ts';

describe(missingFrom, () => {
  it('returns ok with progress when all expected items are present', () => {
    const result = missingFrom('files', ['a', 'b'], ['a', 'b', 'c']);

    expect(result).toStrictEqual({
      ok: true,
      progress: { type: 'fraction', passedCount: 2, count: 2 },
    });
  });

  it('returns not ok with missing items listed when some are absent', () => {
    const result = missingFrom('fields', ['a', 'b', 'c'], ['b']);

    expect(result).toStrictEqual({
      ok: false,
      detail: 'Of the fields, a and c are missing',
      progress: { type: 'fraction', passedCount: 1, count: 3 },
    });
  });

  it('returns not ok when all items are missing', () => {
    const result = missingFrom('deps', ['x', 'y'], []);

    expect(result).toStrictEqual({
      ok: false,
      detail: 'Of the deps, x and y are missing',
      progress: { type: 'fraction', passedCount: 0, count: 2 },
    });
  });

  it('lists three or more missing items in a series', () => {
    const result = missingFrom('files', ['a', 'b', 'c'], []);

    expect(result).toMatchObject({ ok: false, detail: 'Of the files, a, b, and c are missing' });
  });

  it('uses a singular verb when one item is missing', () => {
    const result = missingFrom('files', ['a', 'b'], ['a']);

    expect(result).toMatchObject({ ok: false, detail: 'Of the files, b is missing' });
  });

  it('returns ok with zero counts for an empty expected list', () => {
    const result = missingFrom('files', [], ['a']);

    expect(result).toStrictEqual({
      ok: true,
      progress: { type: 'fraction', passedCount: 0, count: 0 },
    });
  });

  it('is reachable from the check-utils barrel', () => {
    expect(missingFromBarrel).toBe(missingFrom);
  });
});
