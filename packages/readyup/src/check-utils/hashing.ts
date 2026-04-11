import { createHash } from 'node:crypto';

import { readFile } from './filesystem.ts';

/** Compute the SHA-256 hex digest of a string. */
export function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Check whether a file's content matches an expected SHA-256 hash. */
export function fileMatchesHash(relativePath: string, expectedHash: string): boolean {
  const content = readFile(relativePath);
  if (content === undefined) return false;
  return computeHash(content) === expectedHash;
}
