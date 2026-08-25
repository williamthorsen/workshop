import { Buffer } from 'node:buffer';

import type { Blob } from '../schemas/file-schemas.ts';

/**
 * Encodes bytes as the blob a plan stores, as text where the bytes are text and byte for byte where they are not.
 *
 * The choice is made by re-encoding the decoded text and comparing: bytes that survive the round trip are text, and
 * bytes that do not would lose their identity in a plan that stored them as a string. Deciding this way is what keeps
 * the engine from having to know which file extensions are binary, a vocabulary it has none of.
 */
export function encodeBlob(bytes: Uint8Array): Blob {
  const buffer = Buffer.from(bytes);
  const text = buffer.toString('utf8');

  if (Buffer.from(text, 'utf8').equals(buffer)) {
    return { encoding: 'utf8', data: text };
  }
  return { encoding: 'base64', data: buffer.toString('base64') };
}
