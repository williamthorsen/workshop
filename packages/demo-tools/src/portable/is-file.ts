import { statSync } from 'node:fs';

/** Reports whether `filePath` names an existing regular file. */
export function isFile(filePath: string): boolean {
  return statSync(filePath, { throwIfNoEntry: false })?.isFile() === true;
}
