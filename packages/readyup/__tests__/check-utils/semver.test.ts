import { describe, expect, it } from 'vitest';

import { compareVersions } from '../../src/check-utils/semver.ts';

describe(compareVersions, () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('returns negative when a < b (major)', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
  });

  it('returns positive when a > b (major)', () => {
    expect(compareVersions('3.0.0', '2.0.0')).toBeGreaterThan(0);
  });

  it('returns negative when a < b (minor)', () => {
    expect(compareVersions('1.1.0', '1.2.0')).toBeLessThan(0);
  });

  it('returns positive when a > b (patch)', () => {
    expect(compareVersions('1.0.5', '1.0.3')).toBeGreaterThan(0);
  });

  it('treats missing parts as 0', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
  });
});
