import path from 'node:path';

/** A path rendered with posix separators, so a value built on Windows matches one built anywhere else. */
export function toPosix(filePath: string): string {
  return filePath.split(path.sep).join('/');
}
