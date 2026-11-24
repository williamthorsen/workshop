import { describe, expect, it } from 'vitest';

import { findNearestName } from '../find-nearest-name.ts';

const NAMES = ['oil', 'engraving', 'watercolor', 'noir'];

describe(findNearestName, () => {
  it.each([
    ['oyl', 'oil'],
    ['watercolour', 'watercolor'],
    ['engarving', 'engraving'],
  ])('suggests the name nearest to %o', (input, expected) => {
    expect(findNearestName(input, NAMES)).toBe(expected);
  });

  it('suggests nothing for an input that is not near any name', () => {
    expect(findNearestName('pastel', NAMES)).toBeUndefined();
  });
});
