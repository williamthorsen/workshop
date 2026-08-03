import type { Stats } from 'node:fs';
import { stat } from 'node:fs/promises';

import { isMissingFile } from './isMissingFile.ts';

/**
 * Reads the stats of `filePath`, or nothing when it is absent.
 *
 * Follows symlinks, which `readdir`'s own file types do not: a symlinked directory reports as a link rather than as
 * the directory it points at, and under a linked layout that would hide its contents entirely.
 */
export async function statIfPresent(filePath: string): Promise<Stats | undefined> {
  try {
    return await stat(filePath);
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}
