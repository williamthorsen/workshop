import { stat } from 'node:fs/promises';

import { isMissingFile } from '../portable/isMissingFile.ts';
import type { SourceSpec } from '../schemas/catalog-schemas.ts';

/**
 * Throws unless `source` points at a readable directory.
 *
 * A source that is absent, or is a file where a directory was declared, is a mistake in the declaration rather than an
 * empty source, and every artifact it was meant to carry would otherwise resolve from somewhere else without a word.
 */
export async function assertSourceIsReadable(source: SourceSpec): Promise<void> {
  let entry;
  try {
    entry = await stat(source.dir);
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      throw new Error(`Source "${source.name}" points at "${source.dir}", which does not exist.`, { cause: error });
    }
    throw error;
  }
  if (!entry.isDirectory()) {
    throw new Error(`Source "${source.name}" points at "${source.dir}", which is not a directory.`);
  }
}
