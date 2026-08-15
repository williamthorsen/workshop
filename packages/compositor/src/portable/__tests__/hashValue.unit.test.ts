import { describe, expect, it } from 'vitest';

import { hashUtf8 } from '../hash-content.ts';
import { hashValue } from '../hashValue.ts';

describe(hashValue, () => {
  it('digests two records alike however their keys were inserted', () => {
    expect(hashValue({ alpha: 1, beta: 2 })).toBe(hashValue({ beta: 2, alpha: 1 }));
  });

  it('sorts keys at every depth, a config nesting tiers within tiers', () => {
    expect(hashValue({ outer: { alpha: [{ beta: 1, gamma: 2 }] } })).toBe(
      hashValue({ outer: { alpha: [{ gamma: 2, beta: 1 }] } }),
    );
  });

  it('distinguishes two arrays holding the same entries in different orders, order being content', () => {
    expect(hashValue(['alpha', 'beta'])).not.toBe(hashValue(['beta', 'alpha']));
  });

  it('drops a key holding undefined, so declaring one and omitting it digest alike', () => {
    expect(hashValue({ alpha: 1, beta: undefined })).toBe(hashValue({ alpha: 1 }));
  });

  it('distinguishes values a loose comparison would not', () => {
    expect(hashValue({ alpha: 1 })).not.toBe(hashValue({ alpha: '1' }));
  });

  it('digests a bare undefined, which JSON serializes to nothing at all', () => {
    expect(hashValue(undefined)).toBe(hashUtf8(''));
  });
});
