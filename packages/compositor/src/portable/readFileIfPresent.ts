import { readFile } from 'node:fs/promises';

import { reportsMissingPath } from './reportsMissingPath.ts';

/**
 * Reads `filePath`, resolving to `undefined` when it is absent.
 *
 * Any other failure rethrows, so a permission problem surfaces instead of reading as a bare absence and sending the
 * caller on as though nothing were there.
 */
export async function readFileIfPresent(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (reportsMissingPath(error)) {
      return undefined;
    }
    throw error;
  }
}
