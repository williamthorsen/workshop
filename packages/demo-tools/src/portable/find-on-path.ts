import { accessSync, constants, statSync } from 'node:fs';
import path from 'node:path';

/** Returns the first executable file named `name` in the directories of `pathValue`, a `PATH`-style list. */
export function findOnPath(name: string, pathValue: string | undefined): string | undefined {
  const dirs = (pathValue ?? '').split(path.delimiter);
  for (const dir of dirs) {
    if (dir === '') continue;
    const candidate = path.join(dir, name);
    if (isExecutableFile(candidate)) return candidate;
  }
  return undefined;
}

// region | Helpers

/** Reports whether `filePath` is a file that this process may execute. */
function isExecutableFile(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK);
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

// endregion | Helpers
