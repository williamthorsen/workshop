import { createHash } from 'node:crypto';

import { readFile } from './filesystem.ts';

/** Computes the SHA-256 hex digest of a string. */
export function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Checks whether a file's content matches an expected SHA-256 hash. */
export function fileMatchesHash(filePath: string, expectedHash: string): boolean {
  const content = readFile(filePath);
  if (content === undefined) return false;
  return computeHash(content) === expectedHash;
}
