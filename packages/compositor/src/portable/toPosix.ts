import path from 'node:path';

/** Renders a path with posix separators, so a value built on Windows matches one built anywhere else. */
export function toPosix(filePath: string): string {
  return filePath.split(path.sep).join('/');
}
