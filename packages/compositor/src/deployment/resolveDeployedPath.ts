import type { KindDeployment } from '../schemas/render-target-schemas.ts';

/**
 * Resolves where one of an artifact's files lands, relative to the target's root and with POSIX separators.
 *
 * `relPath` is the file's path within the artifact's own directory, which only a directory layout has: it defaults to
 * the entry file, and naming one under a file layout throws, since a file layout holds exactly one file and a caller
 * asking for a second has a fault no path could express.
 *
 * A layout rooted at the empty string puts the kind at the target's root, which is how a destination that keeps one
 * guidance file beside its directories is expressed.
 */
export function resolveDeployedPath(deployment: KindDeployment, deployedName: string, relPath?: string): string {
  const { layout } = deployment;

  if (layout.form === 'file') {
    if (relPath !== undefined) {
      throw new Error(`Cannot resolve "${relPath}" within "${deployedName}": kind "${deployment.kindId}" is one file.`);
    }
    return joinPosix(layout.root, `${deployedName}${layout.extension}`);
  }

  return joinPosix(layout.root, deployedName, relPath ?? layout.entryFile);
}

// region | Helpers

/** Joins path segments with `/`, dropping the empty segments a root-level layout produces. */
function joinPosix(...segments: ReadonlyArray<string>): string {
  return segments.filter((segment) => segment !== '').join('/');
}

// endregion | Helpers
