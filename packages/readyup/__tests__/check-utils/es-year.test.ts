import { describe, expect, it } from 'vitest';

import { esYearForNodeMajor } from '../../src/check-utils/es-year.ts';

describe(esYearForNodeMajor, () => {
  it.each([
    [18, 'es2022'],
    [20, 'es2023'],
    [22, 'es2024'],
    [24, 'es2025'],
  ])('maps Node %i to %s', (major, esYear) => {
    expect(esYearForNodeMajor(major)).toBe(esYear);
  });

  it('returns undefined for a non-LTS odd major', () => {
    expect(esYearForNodeMajor(23)).toBeUndefined();
  });

  it('returns undefined for a major below the table', () => {
    expect(esYearForNodeMajor(16)).toBeUndefined();
  });

  it('returns undefined for a major above the table', () => {
    expect(esYearForNodeMajor(26)).toBeUndefined();
  });
});
