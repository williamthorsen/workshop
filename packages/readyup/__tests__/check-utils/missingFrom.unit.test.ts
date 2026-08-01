import { describe, expect, it } from 'vitest';

import { missingFrom as missingFromBarrel } from '../../src/check-utils/index.ts';
import { missingFrom } from '../../src/check-utils/missingFrom.ts';

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
      detail: 'missing fields: a, c',
      progress: { type: 'fraction', passedCount: 1, count: 3 },
    });
  });

  it('returns not ok when all items are missing', () => {
    const result = missingFrom('deps', ['x', 'y'], []);

    expect(result).toStrictEqual({
      ok: false,
      detail: 'missing deps: x, y',
      progress: { type: 'fraction', passedCount: 0, count: 2 },
    });
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
