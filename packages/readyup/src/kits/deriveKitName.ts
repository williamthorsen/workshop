import path from 'node:path';

/** Extension of a kit source, and the only one that a compile sweep collects. */
const SOURCE_EXTENSION = '.ts';

/**
 * Returns the name of the kit compiled from a source, which is the source's path relative to the source
 * directory with its extension removed.
 *
 * Separators become `/` on every platform, because the name is what the manifest records and what
 * `rdy run` takes: a name holding a backslash would name one file on Windows and another nowhere else.
 * A path that does not end in the source extension keeps its whole final segment, as a `.d.ts` source does.
 */
export function deriveKitName(sourcePath: string): string {
  const withoutExtension = sourcePath.endsWith(SOURCE_EXTENSION)
    ? sourcePath.slice(0, -SOURCE_EXTENSION.length)
    : sourcePath;
  return withoutExtension.split(path.sep).join('/');
}
