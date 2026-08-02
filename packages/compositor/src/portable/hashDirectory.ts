import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Hash } from '../schemas/common.ts';
import { compareStrings } from './compareStrings.ts';
import { hashBytes, hashUtf8 } from './hash-content.ts';
import { listFilesRecursively } from './listFilesRecursively.ts';

/**
 * A digest over everything under `dir`, keyed by each file's path within it.
 *
 * Covers a whole tree rather than any one file, because a directory-shaped artifact ships assets beside the file
 * carrying its frontmatter and a rebuilt asset is a changed artifact. Paths take part in the digest, so moving a file
 * within the tree moves the digest too. Dotfiles are left out as tool state rather than shipped content.
 */
export async function hashDirectory(dir: string): Promise<Hash> {
  const relativePaths = (await listFilesRecursively(dir, { skipName: isToolState })).toSorted(compareStrings);
  const perFile = await Promise.all(
    relativePaths.map(async (relativePath) => {
      const bytes = await readFile(path.join(dir, relativePath));
      return `${relativePath}\n${hashBytes(bytes)}`;
    }),
  );
  return hashUtf8(perFile.join('\n'));
}

// region | Helpers

/** Reports whether `name` is a tool's own state rather than content the tree ships. */
function isToolState(name: string): boolean {
  return name.startsWith('.');
}

// endregion | Helpers
