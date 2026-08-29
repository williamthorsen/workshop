import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { hashToRecordedLength } from '../check-utils/hashing.ts';

/** Length of the hex prefix `rdy compile` records for a hash. */
const HASH_PREFIX_LENGTH = 8;

/**
 * Returns the hash of a buffer in the form the manifest records it.
 *
 * This and its two siblings write a record; they are not how one is read back. A reader compares
 * through `hashToRecordedLength`, which honors whatever prefix the compile that wrote the record
 * used, so hashing here and comparing the result would reinstate a fixed-length comparison.
 */
export function hashBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, HASH_PREFIX_LENGTH);
}

/** Returns the hash of a file in the form the manifest records it. */
export function hashFile(filePath: string): string {
  return hashBytes(readFileSync(filePath));
}

/** Returns a file's SHA-256 digest truncated to a recorded hash's own length. */
export function hashFileToRecordedLength(filePath: string, recorded: string): string {
  return hashToRecordedLength(readFileSync(filePath), recorded);
}

/**
 * Returns the hash of a serialized JSON projection, which is what a recorded inline input stores.
 *
 * The compile hashes the projection through here, so its serialization and the hash over it are one
 * format rather than two implementations that can drift.
 */
export function hashProjection(projection: string): string {
  return hashBytes(Buffer.from(projection, 'utf8'));
}
