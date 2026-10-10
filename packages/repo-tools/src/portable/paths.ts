/** Returns `HOME` from an environment, without trailing slashes, or an empty string when it is unset. */
export function readHome(env: Readonly<Record<string, string | undefined>>): string {
  return (env['HOME'] ?? '').replace(/\/+$/, '');
}

/** Expands a leading `~` or `~/` to the home directory, returning any other value unchanged. */
export function expandTilde(value: string, home: string): string {
  if (value === '~') return home;
  if (value.startsWith('~/')) return `${home}/${value.slice(2)}`;
  return value;
}

/** Abbreviates a path inside the home directory to its `~` form, returning any other path unchanged. */
export function formatDisplayPath(value: string, home: string): string {
  if (home === '') return value;
  if (value === home) return '~';
  if (value.startsWith(`${home}/`)) return `~/${value.slice(home.length + 1)}`;
  return value;
}
