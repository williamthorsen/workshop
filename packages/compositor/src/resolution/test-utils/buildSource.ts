import type { SourceSpec } from '../../schemas/resolution-schemas.ts';
import { buildTempTree } from '../../test-utils/buildTempTree.ts';

/**
 * A source directory holding each path in `files` with the given content, removed when the test ends.
 *
 * `name` becomes the source's id, its name, and its temp-directory prefix, so a test resolving several sources can
 * tell which directory belongs to which.
 */
export async function buildSource(files: Record<string, string>, name = 'fixture'): Promise<SourceSpec> {
  const dir = await buildTempTree(files, `compositor-${name}`);

  return { id: name, name, origin: { kind: 'directory', location: dir }, dir };
}
