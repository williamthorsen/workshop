import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Hash } from '../schemas/scalar-schemas.ts';
import { compareStrings } from './compareStrings.ts';
import { hashBytes, hashUtf8 } from './hash-content.ts';
import { listFilesRecursively } from './listFilesRecursively.ts';
import { namesToolState } from './namesToolState.ts';

/**
 * Hashes everything under `dir`, keying each file by its path within the tree.
 *
 * A directory-shaped artifact ships assets beside the file containing its frontmatter, and a rebuilt asset is a changed
 * artifact. Paths take part in the digest, so moving a file within the tree moves the digest too. Dotfiles are left
 * out as tool state rather than shipped content.
 */
export async function hashDirectory(dir: string): Promise<Hash> {
  const relativePaths = (await listFilesRecursively(dir, { skipName: namesToolState })).toSorted(compareStrings);
  const perFile = await Promise.all(
    relativePaths.map(async (relativePath) => {
      const bytes = await readFile(path.join(dir, relativePath));
      return `${relativePath}\n${hashBytes(bytes)}`;
    }),
  );
  return hashUtf8(perFile.join('\n'));
}
