import { isError } from '@williamthorsen/toolbelt.errors';

import { deriveKitName } from '../kits/deriveKitName.ts';
import type { ResolvedRdyConfig } from '../kits/types.ts';
import { collectSourceFiles } from './collectSourceFiles.ts';

/** Extension of the sources that a project compiles. */
const SOURCE_EXTENSION = '.ts';

/**
 * Returns the sorted names of the kits that a project's compile settings select under `srcDir`, or `[]`
 * where `srcDir` does not exist.
 *
 * The selection is `collectSourceFiles`', so what `rdy run --all --jit` and `rdy list` report is what
 * `rdy compile` would build. A module that the kits share is kept out of both by the same `include` or
 * `exclude` that keeps it out of the sweep.
 *
 * A missing directory yields no names rather than an error, which leaves a caller free to report the
 * emptiness in its own terms. Any other filesystem error, such as `EACCES`, is rethrown.
 */
export function collectSourceKitNames(
  srcDir: string,
  selection: Pick<ResolvedRdyConfig['compile'], 'exclude' | 'include'>,
): string[] {
  let relativePaths: string[];
  try {
    relativePaths = collectSourceFiles(srcDir, selection);
  } catch (error: unknown) {
    if (isError(error) && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }

  return relativePaths.map((relativePath) => deriveKitName(relativePath, SOURCE_EXTENSION)).toSorted();
}
