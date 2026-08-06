import path from 'node:path';

const TS_EXTENSIONS = new Set(['.cts', '.mts', '.ts']);

/** Derives a `.js` sibling path from a `.ts`/`.mts`/`.cts` input. Any other extension is appended to, not replaced. */
export function deriveJsPath(inputPath: string): string {
  const ext = path.extname(inputPath);
  if (TS_EXTENSIONS.has(ext)) {
    return inputPath.slice(0, -ext.length) + '.js';
  }
  return `${inputPath}.js`;
}
