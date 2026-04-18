import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Length of the hex prefix stored in the manifest's `targetHash` field. */
const HASH_PREFIX_LENGTH = 8;

/** Return the first 8 hex chars of the SHA-256 digest of in-memory bytes. */
export function hashBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, HASH_PREFIX_LENGTH);
}

/** Return the first 8 hex chars of the SHA-256 digest of a file's content. */
export function hashFile(filePath: string): string {
  return hashBytes(readFileSync(filePath));
}
