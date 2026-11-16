import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Returns the total size in bytes of the files under `dir`, counting a symlink's target. */
export function measureDirSize(dir: string): number {
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
  let bytes = 0;
  for (const entry of entries) {
    const stats = statSync(path.join(entry.parentPath, entry.name));
    if (stats.isFile()) bytes += stats.size;
  }
  return bytes;
}
