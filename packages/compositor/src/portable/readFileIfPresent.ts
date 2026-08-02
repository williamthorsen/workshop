import { readFile } from 'node:fs/promises';

import { isMissingFile } from './isMissingFile.ts';

/**
 * Reads `filePath`, resolving to nothing when it is absent.
 *
 * Any other failure rethrows, so a permission problem surfaces instead of reading as a bare absence and sending the
 * caller on as though nothing were there.
 */
export async function readFileIfPresent(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}
