import { Buffer } from 'node:buffer';

import type { Blob } from '../schemas/file-schemas.ts';

/** Decodes the bytes a blob carries, reading it under the encoding it records rather than guessing at its content. */
export function decodeBlob(blob: Blob): Uint8Array {
  return Buffer.from(blob.data, blob.encoding);
}
