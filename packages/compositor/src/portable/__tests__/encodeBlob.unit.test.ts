import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import { encodeBlob } from '../encodeBlob.ts';

// A PNG signature stands in for bytes no UTF-8 reading survives.
const pngSignature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe(encodeBlob, () => {
  it('carries text as text, so a plan a human reads shows the body', () => {
    expect(encodeBlob(Buffer.from('# Review\n', 'utf8'))).toStrictEqual({ encoding: 'utf8', data: '# Review\n' });
  });

  it('carries text outside the ASCII range as text', () => {
    expect(encodeBlob(Buffer.from('naïve — 日本語', 'utf8'))).toStrictEqual({
      encoding: 'utf8',
      data: 'naïve — 日本語',
    });
  });

  it('carries bytes no UTF-8 reading survives as base64', () => {
    expect(encodeBlob(pngSignature).encoding).toBe('base64');
  });

  it('round-trips bytes it encoded as base64', () => {
    const blob = encodeBlob(pngSignature);

    expect(Buffer.from(blob.data, 'base64').equals(Buffer.from(pngSignature))).toBe(true);
  });

  it('carries an empty body as empty text', () => {
    expect(encodeBlob(new Uint8Array())).toStrictEqual({ encoding: 'utf8', data: '' });
  });
});
