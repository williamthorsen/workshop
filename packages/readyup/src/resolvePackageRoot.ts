import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * Locates an installed package's root directory, or `undefined` when the package is not installed.
 *
 * Walks `node_modules` upward from `fromDir` rather than asking the module resolver, which is the wrong
 * instrument twice over: `import.meta.resolve` anchors to readyup's own location instead of the project
 * being checked, and `createRequire` anchors correctly but resolves under the `require` condition, which
 * ESM-only packages do not publish. A package directory is also precisely what `exports` exists to hide,
 * so no specifier can name one.
 *
 * Answers with the real path, so a pnpm store symlink resolves to the directory the package occupies and
 * a workspace link resolves to its source checkout.
 */
export function resolvePackageRoot(packageName: string, fromDir: string = process.cwd()): string | undefined {
  let dir = path.resolve(fromDir);

  for (;;) {
    const candidate = path.join(dir, 'node_modules', packageName);
    // A directory without a manifest is not a package; keep walking rather than claiming a hit.
    if (existsSync(path.join(candidate, 'package.json'))) {
      return realpathSync(candidate);
    }

    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
