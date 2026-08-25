import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

/** Marker naming the directory a kit belongs to, and the unit a published package ships as. */
const PACKAGE_MANIFEST = 'package.json';

/**
 * Returns the directory a kit compiles under: the nearest ancestor holding a `package.json`, or the
 * source's own directory where no ancestor holds one.
 *
 * esbuild renders every bundled module's path against the working directory and writes it into the
 * output, so this decides what a kit compiles to. Anchoring on the package root is what makes a bundle
 * reproducible from any directory, and it keeps a bundle's paths naming the kit's place in the package
 * that ships it.
 *
 * Answers with a real path. esbuild reports the paths it resolved modules to, and a compile resolves
 * the metafile's keys against this directory, so an answer reached through a symlink would record a
 * closure whose paths no reader of it can match.
 */
export function resolveCompileRoot(inputPath: string): string {
  const sourceDir = path.dirname(path.resolve(inputPath));

  for (let directory = sourceDir; ; directory = path.dirname(directory)) {
    if (existsSync(path.join(directory, PACKAGE_MANIFEST))) return toRealPath(directory);
    if (path.dirname(directory) === directory) return toRealPath(sourceDir);
  }
}

// region | Helpers

/**
 * Returns a directory's real path, or the directory itself where it cannot be read.
 *
 * A source that does not exist has no real directory to resolve to, and is left to fail where the
 * bundler reports it rather than as an `ENOENT` raised on the way there.
 */
function toRealPath(directory: string): string {
  try {
    return realpathSync(directory);
  } catch {
    return directory;
  }
}

// endregion | Helpers
