import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import { compareStrings } from '../compareStrings.ts';
import { createBlobStore } from '../createBlobStore.ts';
import { hashBytes, hashUtf8 } from '../hash-content.ts';

describe(createBlobStore, () => {
  it('addresses a UTF-8 body by the digest of its bytes', () => {
    const blobs = createBlobStore();

    expect(blobs.addUtf8('# Lint\n')).toStrictEqual({ hash: hashUtf8('# Lint\n') });
  });

  it('stores a UTF-8 body as text, so a consumer reads it without decoding', () => {
    const blobs = createBlobStore();
    const side = blobs.addUtf8('# Lint\n');

    expect(blobs.toTable()[side.hash]).toStrictEqual({ encoding: 'utf8', data: '# Lint\n' });
  });

  it('base64-encodes a byte body, whose bytes would not survive a round trip through a UTF-8 string', () => {
    const blobs = createBlobStore();
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const side = blobs.addBytes(data);

    expect(side).toStrictEqual({ hash: hashBytes(data) });
    expect(blobs.toTable()[side.hash]).toStrictEqual({ encoding: 'base64', data: 'iVBORw==' });
  });

  it('registers a body already encoded under the hash it was read with', () => {
    const blobs = createBlobStore();
    const side = blobs.addEncoded('sha256:read-from-disk', { encoding: 'base64', data: 'iVBORw==' });

    expect(side).toStrictEqual({ hash: 'sha256:read-from-disk' });
    expect(blobs.toTable()['sha256:read-from-disk']).toStrictEqual({ encoding: 'base64', data: 'iVBORw==' });
  });

  it('emits its entries in hash order, whatever order they were registered in', () => {
    const blobs = createBlobStore();
    const bodies = ['third\n', 'first\n', 'second\n'];
    for (const body of bodies) {
      blobs.addUtf8(body);
    }

    expect(Object.keys(blobs.toTable())).toStrictEqual(bodies.map(hashUtf8).toSorted(compareStrings));
  });

  it('registers one entry for a body added twice, so a body two files share is stored once', () => {
    const blobs = createBlobStore();
    blobs.addUtf8('# Lint\n');
    blobs.addUtf8('# Lint\n');

    expect(Object.keys(blobs.toTable())).toHaveLength(1);
  });

  it('emits an empty table when nothing is registered', () => {
    expect(createBlobStore().toTable()).toStrictEqual({});
  });
});
