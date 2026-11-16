import path from 'node:path';

/**
 * Expands a leading `~` or `~/` to the home directory, returning any other value unchanged. Throws for a `~` path when
 * the home directory is unknown, which a caller prevents by checking its paths with `isTildePath` first.
 */
export function expandTilde(value: string, home: string): string {
  if (!isTildePath(value)) return value;
  if (home === '') throw new Error(`cannot expand ${value}: the home directory is unknown`);
  return value === '~' ? home : `${home}/${value.slice(2)}`;
}

/** Abbreviates a path inside the home directory to its `~` form, returning any other path unchanged. */
export function formatDisplayPath(value: string, home: string): string {
  if (home === '') return value;
  if (value === home) return '~';
  if (value.startsWith(`${home}/`)) return `~/${value.slice(home.length + 1)}`;
  return value;
}

/** Reports whether a path starts with the `~` or `~/` that `expandTilde` expands. */
export function isTildePath(value: string): boolean {
  return value === '~' || value.startsWith('~/');
}

/**
 * Returns an absolute path with a leading `~` expanded and trailing slashes removed, without resolving symlinks, so
 * that two spellings of a registry path compare equal.
 */
export function normalizePath(value: string, home: string): string {
  return path.resolve(expandTilde(value, home));
}

/** Returns `HOME` from an environment, without trailing slashes, or an empty string when it is unset. */
export function readHome(env: Readonly<Record<string, string | undefined>>): string {
  return (env['HOME'] ?? '').replace(/\/+$/, '');
}
