import path from 'node:path';

import type { ProtectEntry } from './readProtectList.ts';

/**
 * Finds the first protect-list entry whose glob matches a directory or any of its ancestors, so that a pattern
 * protects the directory that it names and everything beneath it.
 *
 * @internal
 */
export function findProtectingPattern(dir: string, entries: readonly ProtectEntry[]): ProtectEntry | undefined {
  const chain = listSelfAndAncestors(dir);

  return entries.find((entry) => chain.some((candidate) => path.matchesGlob(candidate, entry.glob)));
}

// region | Helpers

/** Lists a directory and each of its ancestors, up to the filesystem root. */
function listSelfAndAncestors(dir: string): string[] {
  const chain: string[] = [];
  let current = path.resolve(dir);

  for (;;) {
    chain.push(current);
    const parent = path.dirname(current);
    if (parent === current) return chain;
    current = parent;
  }
}

// endregion | Helpers
