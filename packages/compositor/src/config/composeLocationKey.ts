import path from 'node:path';

/**
 * Composes the key one located package is identified by.
 *
 * Base directory and package name are the whole of what package resolution depends on, so they are what a located
 * package is keyed by, and a fold may rename sources, remap paths, and reorder tiers against one set of locations
 * without losing any of them.
 *
 * The base directory is normalized, so two tiers spelling one directory differently ask about the same package once.
 * Normalization rather than resolution: resolving a relative base would read the working directory, which would put
 * ambient state into the pure fold that reads these keys back. Joining against `.` is what normalizes, since
 * `path.normalize` keeps a trailing separator and the two spellings must key alike.
 */
export function composeLocationKey(baseDir: string, packageName: string): string {
  return `${path.join(baseDir, '.')}\0${packageName}`;
}
