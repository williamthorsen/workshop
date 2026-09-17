import path from 'node:path';

/** Reports whether `targetPath` lies below `directory`, rather than being the directory itself or outside it. */
export function isInsideDirectory(directory: string, targetPath: string): boolean {
  const relativePath = path.relative(directory, targetPath);
  return relativePath !== '' && !path.isAbsolute(relativePath) && relativePath.split(path.sep)[0] !== '..';
}
