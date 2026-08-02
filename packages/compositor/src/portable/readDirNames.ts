import { readdir } from 'node:fs/promises';

import { isMissingFile } from './isMissingFile.ts';

/**
 * The entry names directly under `dir`, or none when `dir` is absent.
 *
 * Any other failure rethrows, so a permission problem surfaces instead of reading as an empty directory and sending
 * the caller on as though nothing were there.
 */
export async function readDirNames(dir: string): Promise<Array<string>> {
  try {
    return await readdir(dir);
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  }
}
