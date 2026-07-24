import path from 'node:path';
import process from 'node:process';

/**
 * Render a path for display, relative to the current directory when it sits inside it.
 *
 * A path outside the current directory keeps its absolute form: a chain of `..` segments is
 * harder to act on than the path the reader would have typed.
 */
export function toDisplayPath(targetPath: string): string {
  const absolutePath = path.resolve(process.cwd(), targetPath);
  const relativePath = path.relative(process.cwd(), absolutePath);
  if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return absolutePath;
  }
  return relativePath;
}
