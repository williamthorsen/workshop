import fs from 'node:fs';
import path from 'node:path';

const GIT_DIR = '.git';
const NODE_MODULES = 'node_modules';

/**
 * Lists every `node_modules` directory under a root, sorted. It neither follows symlinks nor searches inside a
 * `node_modules` or `.git` directory, and passes each directory that it cannot read to `onUnreadable`.
 *
 * @internal
 */
export function listNodeModulesDirs(root: string, options: ListNodeModulesDirsOptions = {}): string[] {
  const found: string[] = [];
  const pending = [root];

  for (let dir = pending.pop(); dir !== undefined; dir = pending.pop()) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      options.onUnreadable?.(dir, error);
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === GIT_DIR) continue;

      const child = path.join(dir, entry.name);
      if (entry.name === NODE_MODULES) found.push(child);
      else pending.push(child);
    }
  }

  return found.toSorted();
}

export interface ListNodeModulesDirsOptions {
  /** Receives a directory that could not be read, and the error. */
  readonly onUnreadable?: (dir: string, error: unknown) => void;
}
