import path from 'node:path';

import { isInsideDirectory } from '../portable/isInsideDirectory.ts';

/** Extension of the bundle that a kit compiles to. */
const BUNDLE_EXTENSION = '.js';

/**
 * Returns the name of the kit that a file holds, which is its path relative to the directory that roots it
 * with `extension` removed.
 *
 * Separators become `/` on every platform, because the name is what the manifest records and what
 * `rdy run` takes: a name holding a backslash would name one file on Windows and another nowhere else.
 * A path that does not end in `extension` keeps its whole final segment, as a `.d.ts` source does under `.ts`.
 */
export function deriveKitName(relativePath: string, extension: string): string {
  const withoutExtension = relativePath.endsWith(extension) ? relativePath.slice(0, -extension.length) : relativePath;
  return withoutExtension.split(path.sep).join('/');
}

/**
 * Returns the name of the kit that a bundle holds, given the output directory against which names are resolved.
 *
 * A bundle outside that directory takes its own basename. `rdy run` locates a kit by joining its name onto the
 * output directory, so no name reaches such a bundle, and the basename is the name that its reader recognizes.
 */
export function deriveKitNameFromBundle(bundlePath: string, outDir: string): string {
  if (!isInsideDirectory(outDir, bundlePath)) {
    return path.basename(bundlePath, BUNDLE_EXTENSION);
  }
  return deriveKitName(path.relative(outDir, bundlePath), BUNDLE_EXTENSION);
}
