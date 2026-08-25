import process from 'node:process';

/** Convention directory holding a project's readyup state, relative to a project root or the home directory. */
export const READYUP_DIR = '.readyup';

/**
 * Convention directory for kits, relative to a project root or the home directory.
 *
 * `run --from` and `list --from` both resolve against it, which is what lets `list` fall back to
 * enumerating the same files `run` would load when no manifest sits beside them.
 */
export const KITS_DIR = `${READYUP_DIR}/kits`;

/** Returns the home directory the `global` kit source is rooted at, on any platform. */
export function resolveHomeDir(): string {
  return process.env['HOME'] ?? process.env['USERPROFILE'] ?? '~';
}
