import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Length of the hex prefix stored in the manifest's `targetHash` field. */
const HASH_PREFIX_LENGTH = 8;

/** Returns the first 8 hex characters of a buffer's SHA-256 digest. */
export function hashBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, HASH_PREFIX_LENGTH);
}

/** Returns the first 8 hex characters of a file's SHA-256 digest. */
export function hashFile(filePath: string): string {
  return hashBytes(readFileSync(filePath));
}

/**
 * Returns the hash of a serialized JSON projection, which is what a recorded inline input stores.
 *
 * The compile and every reader of a recorded input hash the projection through here, so neither can
 * encode it differently and report a file neither changed as stale.
 */
export function hashProjection(projection: string): string {
  return hashBytes(Buffer.from(projection, 'utf8'));
}
