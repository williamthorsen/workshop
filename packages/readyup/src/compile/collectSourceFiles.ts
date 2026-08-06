import { readdirSync } from 'node:fs';

import picomatch from 'picomatch';

/**
 * Collects `.ts` files matching the optional `include` glob, falling back to all `.ts` files.
 *
 * The walk is recursive and the glob is matched against paths relative to `srcDir`, so a project that
 * filters a nested source tree gets the same set from anyone asking what it would compile.
 */
export function collectSourceFiles(srcDir: string, includeGlob: string | undefined): string[] {
  const entries = readdirSync(srcDir, { recursive: true, encoding: 'utf8' });
  const isMatch = includeGlob !== undefined ? picomatch(includeGlob) : undefined;
  return entries.filter((name) => name.endsWith('.ts') && (isMatch === undefined || isMatch(name))).toSorted();
}
