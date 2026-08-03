import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import type { Hash } from '../schemas/scalar-schemas.ts';

/** A digest of `data`, prefixed with the algorithm that produced it. */
export function hashBytes(data: Uint8Array): Hash {
  return `sha256:${createHash('sha256').update(data).digest('hex')}`;
}

/** A digest of `text` taken over its UTF-8 bytes. */
export function hashUtf8(text: string): Hash {
  return hashBytes(Buffer.from(text, 'utf8'));
}
