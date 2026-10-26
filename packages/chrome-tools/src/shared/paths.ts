import fs from 'node:fs';
import path from 'node:path';

/** Returns the first executable file named `name` in a colon-separated search path. */
export function findOnPath(name: string, searchPath: string): string | undefined {
  for (const directory of searchPath.split(':')) {
    if (directory === '') continue;
    const candidate = path.join(directory, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Try the next directory.
    }
  }
  return undefined;
}

/** Reports whether a path is a directory, following symlinks. */
export function isDirectory(value: string): boolean {
  try {
    return fs.statSync(value).isDirectory();
  } catch {
    return false;
  }
}

/** Reports whether the current process may execute a path. */
export function isExecutable(value: string): boolean {
  try {
    fs.accessSync(value, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
