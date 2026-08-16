import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { disposeOnTestFinished } from '@williamthorsen/toolbelt.vitest/candidate';

import type { SourceSpec } from '../../schemas/catalog-schemas.ts';

/**
 * Builds a source directory holding each path in `files` with the given content, removed when the test ends.
 *
 * `name` becomes the source's id, its name, and its temp-directory prefix, so a test resolving several sources can
 * tell which directory belongs to which.
 */
export function buildSource(files: Record<string, string>, name = 'fixture'): SourceSpec {
  const { dir } = disposeOnTestFinished(createTempTree(files, { prefix: `compositor-${name}-` }));

  return { id: name, name, origin: { kind: 'directory', location: dir }, dir };
}
