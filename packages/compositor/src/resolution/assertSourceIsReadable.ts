import { stat } from 'node:fs/promises';

import { isMissingPathError } from '@williamthorsen/toolbelt.errors/candidate';

import { DeclarationError } from '../declaration/DeclarationError.ts';
import type { SourceSpec } from '../schemas/catalog-schemas.ts';

/**
 * Throws unless `source` points at a readable directory.
 *
 * A source that is absent, or is a file where a directory was declared, is a mistake in the declaration rather than an
 * empty source, and every artifact it was meant to contain would otherwise resolve from somewhere else without a word.
 */
export async function assertSourceIsReadable(source: SourceSpec): Promise<void> {
  let entry;
  try {
    entry = await stat(source.dir);
  } catch (error: unknown) {
    if (isMissingPathError(error)) {
      throw new DeclarationError(`Source "${source.name}" points at "${source.dir}", which does not exist.`, {
        cause: error,
      });
    }
    throw error;
  }
  if (!entry.isDirectory()) {
    throw new DeclarationError(`Source "${source.name}" points at "${source.dir}", which is not a directory.`);
  }
}
