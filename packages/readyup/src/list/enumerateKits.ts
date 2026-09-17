import { readdirSync } from 'node:fs';
import path from 'node:path';

import { isError } from '@williamthorsen/toolbelt.errors';

import { deriveKitName } from '../kits/deriveKitName.ts';

interface EnumerateKitsOptions {
  dir: string;
  extension: string;
  /**
   * Whether to read the subdirectories of `dir`.
   *
   * Set for the bundles of a project, which a kit named for its source path puts below `dir`. Unset for the
   * internal directory, whose kits `internal.dir` and `internal.infix` declare rather than a path below it.
   */
  recursive: boolean;
}

/**
 * Returns the sorted names, extension stripped, of the files in `dir` matching `extension`, or `[]` where
 * `dir` does not exist.
 *
 * A name is the file's path relative to `dir`, so a recursive read returns the name under which `rdy run`
 * resolves the kit. A hidden file is excluded, and so is every file below a hidden directory. A filesystem
 * error that is not a missing directory, such as `EACCES`, is rethrown.
 */
export function enumerateKits({ dir, extension, recursive }: EnumerateKitsOptions): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { recursive, withFileTypes: true });
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => (recursive ? path.relative(dir, path.join(entry.parentPath, entry.name)) : entry.name))
    .filter((relativePath) => !isHidden(relativePath))
    .map((relativePath) => deriveKitName(relativePath, extension))
    .toSorted();
}

// region | Helpers

/** Reports whether any segment of a relative path is hidden, which is one whose name starts with `.`. */
function isHidden(relativePath: string): boolean {
  return relativePath.split(path.sep).some((segment) => segment.startsWith('.'));
}

/** Reports whether an error is a Node.js filesystem error, which is one with a `code` property. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return isError(error) && 'code' in error;
}

// endregion | Helpers
