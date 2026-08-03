import { buildTempTree } from '../../test-utils/buildTempTree.ts';

/** Builds a directory holding each path in `files` with the given content, removed when the test ends. */
export async function buildConfigDir(files: Record<string, string>): Promise<string> {
  return buildTempTree(files, 'compositor-config');
}
