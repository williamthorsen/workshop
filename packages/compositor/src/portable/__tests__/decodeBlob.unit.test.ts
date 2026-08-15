import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import { decodeBlob } from '../decodeBlob.ts';
import { encodeBlob } from '../encodeBlob.ts';

describe(decodeBlob, () => {
  it('decodes a text blob to the bytes its data spells', () => {
    expect(decodeBlob({ encoding: 'utf8', data: '# Review\n' })).toStrictEqual(Buffer.from('# Review\n', 'utf8'));
  });

  it('decodes a byte blob through the base64 it records', () => {
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

    expect(decodeBlob({ encoding: 'base64', data: Buffer.from(bytes).toString('base64') })).toStrictEqual(
      Buffer.from(bytes),
    );
  });

  it.each([
    ['text', Buffer.from('Name things well.\n', 'utf8')],
    ['bytes no UTF-8 round trip survives', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ])('round-trips %s through the encoder', (_label, bytes) => {
    expect(decodeBlob(encodeBlob(bytes))).toStrictEqual(bytes);
  });
});
