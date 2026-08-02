import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import { hashBytes, hashUtf8 } from '../hash-content.ts';

describe(hashBytes, () => {
  it('names the algorithm that produced the digest, so a stored hash stays readable when another is added', () => {
    expect(hashBytes(Buffer.from('lint', 'utf8'))).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('gives equal bytes equal digests', () => {
    expect(hashBytes(Buffer.from('lint', 'utf8'))).toBe(hashBytes(Buffer.from('lint', 'utf8')));
  });

  it('gives differing bytes differing digests', () => {
    expect(hashBytes(Buffer.from('lint', 'utf8'))).not.toBe(hashBytes(Buffer.from('format', 'utf8')));
  });

  it('digests empty input rather than refusing it', () => {
    expect(hashBytes(new Uint8Array())).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe(hashUtf8, () => {
  it('digests text over its UTF-8 bytes, which is the relationship the two functions promise', () => {
    expect(hashUtf8('lint')).toBe(hashBytes(Buffer.from('lint', 'utf8')));
  });

  it('holds that relationship for text outside ASCII, where the byte count exceeds the character count', () => {
    expect(hashUtf8('naïve — ✅')).toBe(hashBytes(Buffer.from('naïve — ✅', 'utf8')));
  });

  it('gives differing text differing digests', () => {
    expect(hashUtf8('lint')).not.toBe(hashUtf8('format'));
  });
});
