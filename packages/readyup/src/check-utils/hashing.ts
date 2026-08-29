import { createHash } from 'node:crypto';

import { readFile } from './filesystem.ts';

/**
 * The form of a hash the manifest records: a prefix of a SHA-256 hex digest.
 *
 * The floor is the length `rdy compile` writes. A shorter record compares too few characters to
 * distinguish anything, and one of zero length would match every file on every axis at once.
 */
const RECORDED_HASH_PATTERN = /^[0-9a-f]{8,64}$/;

/** Computes the SHA-256 hex digest of a string or byte sequence. */
export function computeHash(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Checks whether a file's content matches an expected SHA-256 hash. */
export function fileMatchesHash(filePath: string, expectedHash: string): boolean {
  const content = readFile(filePath);
  if (content === undefined) return false;
  return computeHash(content) === expectedHash;
}

/**
 * Returns a content's SHA-256 digest truncated to a recorded hash's own length.
 *
 * The recorded value decides how much of the digest to compare, so every reader of a manifest honors
 * whatever prefix the compile that wrote it used rather than a length of its own that a later readyup
 * could outgrow. It takes the recorded value rather than a length, so no caller can reinstate a fixed
 * comparison by reaching for a constant.
 */
export function hashToRecordedLength(content: string | Uint8Array, recorded: string): string {
  return computeHash(content).slice(0, recorded.length);
}

/** Reports whether a value is a well-formed recorded hash. */
export function isRecordedHash(value: string): boolean {
  return RECORDED_HASH_PATTERN.test(value);
}
