import { Buffer } from 'node:buffer';

import type { Blob, FileSide } from '../schemas/file-schemas.ts';
import type { Hash } from '../schemas/scalar-schemas.ts';
import { compareStrings } from './compareStrings.ts';
import { hashBytes, hashUtf8 } from './hash-content.ts';

/**
 * The bodies a plan's files name, addressed by content as each one is registered.
 *
 * Write-only: a plan's `blobs` record is the readable form, which `toTable` emits once construction is done.
 */
export interface BlobStore {
  /** Registers `data` as a byte-encoded blob and returns the file side naming it. */
  addBytes(data: Uint8Array): FileSide;

  /** Registers a body already encoded and already hashed, such as one a snapshot read from disk. */
  addEncoded(hash: Hash, blob: Blob): FileSide;

  /** Registers `data` as a UTF-8 blob and returns the file side naming it. */
  addUtf8(data: string): FileSide;

  /** Collects every registered blob, keyed by hash in hash order. */
  toTable(): Record<Hash, Blob>;
}

/** Creates an empty blob store. */
export function createBlobStore(): BlobStore {
  const blobs = new Map<Hash, Blob>();

  return {
    addBytes(data) {
      const hash = hashBytes(data);
      blobs.set(hash, { encoding: 'base64', data: Buffer.from(data).toString('base64') });
      return { hash };
    },

    addEncoded(hash, blob) {
      blobs.set(hash, blob);
      return { hash };
    },

    addUtf8(data) {
      const hash = hashUtf8(data);
      blobs.set(hash, { encoding: 'utf8', data });
      return { hash };
    },

    toTable() {
      return Object.fromEntries([...blobs].toSorted(([left], [right]) => compareStrings(left, right)));
    },
  };
}
