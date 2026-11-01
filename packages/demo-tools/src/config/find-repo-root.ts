import { existsSync } from 'node:fs';
import path from 'node:path';

/** The repository configuration file, relative to the demo repository's root, whose presence marks that root. */
export const REPO_CONFIG_PATH = '.config/thor-demo.yaml';

/** Returns the nearest directory, from `startDir` upward, that contains the repository configuration file. */
export function findRepoRoot(startDir: string): string | undefined {
  let dir = path.resolve(startDir);
  for (;;) {
    if (existsSync(path.join(dir, REPO_CONFIG_PATH))) return dir;

    const parent = path.dirname(dir);
    if (parent === dir) return undefined;

    dir = parent;
  }
}
