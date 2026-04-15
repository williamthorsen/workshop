import { readFileSync } from 'node:fs';

import { computeHash } from '../check-utils/hashing.ts';

/** Return the first 8 characters of the SHA-256 hex digest of a file's content. */
export function hashSourceFile(filePath: string): string {
  const content = readFileSync(filePath, 'utf8');
  return computeHash(content).slice(0, 8);
}
