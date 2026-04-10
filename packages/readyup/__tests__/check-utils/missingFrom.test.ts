import { describe, expect, it } from 'vitest';

import { missingFrom } from '../../src/check-utils/missingFrom.ts';

describe(missingFrom, () => {
  it('returns ok with progress when all expected items are present', () => {
    const result = missingFrom('files', ['a', 'b'], ['a', 'b', 'c']);

    expect(result).toEqual({
      ok: true,
      progress: { type: 'fraction', passedCount: 2, count: 2 },
    });
  });

  it('returns not ok with missing items listed when some are absent', () => {
    const result = missingFrom('fields', ['a', 'b', 'c'], ['b']);

    expect(result).toEqual({
      ok: false,
      detail: 'Missing fields: a, c',
      progress: { type: 'fraction', passedCount: 1, count: 3 },
    });
  });

  it('returns not ok when all items are missing', () => {
    const result = missingFrom('deps', ['x', 'y'], []);

    expect(result).toEqual({
      ok: false,
      detail: 'Missing deps: x, y',
      progress: { type: 'fraction', passedCount: 0, count: 2 },
    });
  });

  it('returns ok with zero counts for an empty expected list', () => {
    const result = missingFrom('files', [], ['a']);

    expect(result).toEqual({
      ok: true,
      progress: { type: 'fraction', passedCount: 0, count: 0 },
    });
  });
});
