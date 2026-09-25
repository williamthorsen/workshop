import { readdirSync } from 'node:fs';

import picomatch from 'picomatch';

import type { ResolvedRdyConfig } from '../kits/types.ts';

/**
 * Collects the `.ts` files that match `include` (every one, when `include` is `undefined`) and match no `exclude` pattern.
 *
 * The walk is recursive and the globs are matched against paths relative to `srcDir`, so for a project that
 * filters a nested source tree, every caller that asks what it would compile gets the same set. `exclude` also
 * matches hidden files, so that a pattern naming a directory removes everything below it.
 */
export function collectSourceFiles(
  srcDir: string,
  { include, exclude }: Pick<ResolvedRdyConfig['compile'], 'exclude' | 'include'>,
): string[] {
  const entries = readdirSync(srcDir, { recursive: true, encoding: 'utf8' });
  const isIncluded = include === undefined ? undefined : picomatch(include);
  const isExcluded = exclude.length === 0 ? undefined : picomatch(exclude, { dot: true });
  return entries
    .filter(
      (name) =>
        name.endsWith('.ts') &&
        (isIncluded === undefined || isIncluded(name)) &&
        (isExcluded === undefined || !isExcluded(name)),
    )
    .toSorted();
}
