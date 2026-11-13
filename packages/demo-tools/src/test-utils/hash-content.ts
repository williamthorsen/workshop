import { createHash } from 'node:crypto';

/** Returns the sha256 of `content`, as hex. */
export function hashContent(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}
