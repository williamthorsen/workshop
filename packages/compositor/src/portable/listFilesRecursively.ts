import path from 'node:path';

import { readDirNames } from './readDirNames.ts';
import { statIfPresent } from './statIfPresent.ts';

export interface ListFilesRecursivelyOptions {
  /**
   * Names to leave out, tested against each entry's own name rather than against its path.
   *
   * Applied during the walk, so a skipped directory is never descended into. Nothing is skipped by default: what
   * counts as content is the caller's to decide.
   */
  readonly skipName?: (name: string) => boolean;
}

/** Lists every file beneath `dir`, as posix paths relative to `dir` itself. */
export async function listFilesRecursively(
  dir: string,
  options: ListFilesRecursivelyOptions = {},
): Promise<Array<string>> {
  return listFrom(dir, '', options.skipName);
}

// region | Helpers

/** Lists files beneath `dir` as posix paths carrying `prefix`, the walk's position relative to where it started. */
async function listFrom(
  dir: string,
  prefix: string,
  skipName: ((name: string) => boolean) | undefined,
): Promise<Array<string>> {
  const names = (await readDirNames(dir)).filter((name) => skipName?.(name) !== true);
  const nested = await Promise.all(
    names.map(async (name) => {
      const relativePath = prefix === '' ? name : `${prefix}/${name}`;
      const entry = await statIfPresent(path.join(dir, name));
      if (entry === undefined) {
        return [];
      }
      return entry.isDirectory() ? await listFrom(path.join(dir, name), relativePath, skipName) : [relativePath];
    }),
  );
  return nested.flat();
}

// endregion | Helpers
