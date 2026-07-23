import process from 'node:process';

/**
 * Convention directory for kits, relative to a project root or the home directory.
 *
 * `run --from` and `list --from` both resolve against it, which is what lets `list` fall back to
 * enumerating the same files `run` would load when no manifest sits beside them.
 */
export const KITS_DIR = '.readyup/kits';

/** Resolve the home directory the `global` kit source is rooted at, across platforms. */
export function resolveHomeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? '~';
}
