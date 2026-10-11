import fs from 'node:fs';
import path from 'node:path';

const SPEC_FILENAME = 'jira-project-spec.json';

/**
 * Finds the project spec that the consuming repo owns, ascending from a directory to the filesystem root and
 * returning the first one that it reaches, or `undefined` when no ancestor contains one.
 *
 * @internal
 */
export function findSpecPath(startDir: string): string | undefined {
  let dir = path.resolve(startDir);

  for (;;) {
    const specPath = path.join(dir, SPEC_FILENAME);
    if (fs.existsSync(specPath)) return specPath;

    const parent = path.dirname(dir);
    if (parent === dir) return undefined;

    dir = parent;
  }
}
