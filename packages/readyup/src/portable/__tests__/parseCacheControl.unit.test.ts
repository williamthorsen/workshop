import { describe, expect, it } from 'vitest';

import { parseCacheControl, parseDeltaSeconds } from '../parseCacheControl.ts';

describe(parseCacheControl, () => {
  it('returns no directives for an absent header', () => {
    expect(parseCacheControl(null)).toStrictEqual({ maxAgeSec: undefined, noCache: false, noStore: false });
  });

  it('reads max-age, no-cache, and no-store together', () => {
    expect(parseCacheControl('max-age=300, no-cache, no-store')).toStrictEqual({
      maxAgeSec: 300,
      noCache: true,
      noStore: true,
    });
  });

  it('reads directive names case-insensitively and tolerates surrounding whitespace', () => {
    expect(parseCacheControl('  Max-Age = 60 ,NO-STORE')).toStrictEqual({
      maxAgeSec: 60,
      noCache: false,
      noStore: true,
    });
  });

  it('reads a quoted max-age', () => {
    expect(parseCacheControl('max-age="120"').maxAgeSec).toBe(120);
  });

  it.each([
    ['a negative value', 'max-age=-1'],
    ['a fractional value', 'max-age=1.5'],
    ['a non-numeric value', 'max-age=soon'],
    ['no value', 'max-age'],
  ])('treats max-age with %s as absent', (_label, header) => {
    expect(parseCacheControl(header).maxAgeSec).toBeUndefined();
  });

  it('uses only the first max-age', () => {
    expect(parseCacheControl('max-age=invalid, max-age=900').maxAgeSec).toBeUndefined();
    expect(parseCacheControl('max-age=60, max-age=900').maxAgeSec).toBe(60);
  });

  it('reads a no-cache that names header fields as no-cache', () => {
    expect(parseCacheControl('no-cache="set-cookie"').noCache).toBe(true);
  });

  it('ignores directives that a private cache does not act on', () => {
    expect(parseCacheControl('public, s-maxage=900, must-revalidate')).toStrictEqual({
      maxAgeSec: undefined,
      noCache: false,
      noStore: false,
    });
  });
});

describe(parseDeltaSeconds, () => {
  it('parses a non-negative integer', () => {
    expect(parseDeltaSeconds('0')).toBe(0);
    expect(parseDeltaSeconds(' 42 ')).toBe(42);
  });

  it('caps a value beyond the largest that RFC 9111 requires a cache to honor', () => {
    expect(parseDeltaSeconds('99999999999999999999')).toBe(2_147_483_648);
  });

  it('returns undefined for an absent or malformed value', () => {
    expect(parseDeltaSeconds(null)).toBeUndefined();
    expect(parseDeltaSeconds('')).toBeUndefined();
    expect(parseDeltaSeconds('1e3')).toBeUndefined();
  });
});
