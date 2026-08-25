import { readdirSync } from 'node:fs';
import path from 'node:path';

import { isError } from '@williamthorsen/toolbelt.errors';

interface EnumerateKitsOptions {
  dir: string;
  extension: string;
}

/**
 * Returns the sorted base names, extension stripped, of the files in `dir` matching `extension`, or
 * `[]` where `dir` does not exist.
 *
 * The listing is not recursive, and a hidden file, meaning one whose name starts with `.`, is
 * excluded. A filesystem error that is not a missing directory, such as `EACCES`, is rethrown.
 */
export function enumerateKits({ dir, extension }: EnumerateKitsOptions): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension) && !entry.name.startsWith('.'))
    .map((entry) => path.basename(entry.name, extension))
    .toSorted();
}

/** Reports whether an error is a Node.js filesystem error, which is one with a `code` property. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return isError(error) && 'code' in error;
}
