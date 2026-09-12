import { readFileSync } from 'node:fs';
import path from 'node:path';

import { findPackageRoot } from '@williamthorsen/toolbelt.packaging/candidate';

import { internalError } from '../errors/RdyError.ts';

/**
 * Reads one of readyup's own doc files out of `docs/`.
 *
 * The package root is resolved from this module rather than from the working directory, so the same
 * expression finds the file whether rdy runs from an install, from its build output, or from
 * TypeScript source. `docs` is declared in the manifest's `files`, which is what ships it.
 */
export function readDoc(file: string): string {
  const docPath = path.join(findPackageRoot(import.meta.url), 'docs', file);

  try {
    return readFileSync(docPath, 'utf8');
  } catch (error: unknown) {
    throw internalError(`Could not read readyup's documentation at ${docPath}.`, { cause: error });
  }
}
