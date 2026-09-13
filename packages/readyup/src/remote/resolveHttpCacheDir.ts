import path from 'node:path';
import process from 'node:process';

import { resolveHomeDir } from '../kits/kitsDir.ts';

/** Location of readyup's HTTP cache below a cache root. */
const CACHE_SUBDIRECTORY = path.join('readyup', 'http');

/**
 * Returns the directory of readyup's HTTP cache, or `undefined` where no absolute location can be resolved.
 *
 * `XDG_CACHE_HOME` counts only when absolute, as the XDG Base Directory specification requires. A home that is not
 * absolute disables the cache: `resolveHomeDir` falls back to a literal `~`, which would resolve against the working
 * directory.
 */
export function resolveHttpCacheDir(): string | undefined {
  const xdgCacheHome = process.env['XDG_CACHE_HOME'];
  if (xdgCacheHome !== undefined && path.isAbsolute(xdgCacheHome)) {
    return path.join(xdgCacheHome, CACHE_SUBDIRECTORY);
  }

  const homeDir = resolveHomeDir();
  return path.isAbsolute(homeDir) ? path.join(homeDir, '.cache', CACHE_SUBDIRECTORY) : undefined;
}
