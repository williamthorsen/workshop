import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Returns the total size in bytes of the files under `dir`, counting a symlink's target. An entry that cannot be
 * read, such as a dangling symlink or a file removed during the walk, counts as empty.
 */
export function measureDirSize(dir: string): number {
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
  let bytes = 0;
  for (const entry of entries) {
    const stats = statSync(path.join(entry.parentPath, entry.name), { throwIfNoEntry: false });
    if (stats?.isFile() === true) bytes += stats.size;
  }
  return bytes;
}
