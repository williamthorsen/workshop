/** A single apply-side status code from `chezmoi status`. */
export type StatusCode = 'A' | 'M' | 'D' | 'R';

/** One parsed row of `chezmoi status`: a target path and its apply-side code. */
export interface StatusEntry {
  path: string;
  code: StatusCode;
}

const APPLY_CODES = new Set<string>(['A', 'M', 'D', 'R']);

/**
 * Parse `chezmoi status` output into apply-side entries.
 *
 * `chezmoi status` is git-like with two columns: the first is the source-side code, the second (index 1) is the
 * apply-side code overlay acts on. Each line is `<col1><col2> <path>`. Lines whose apply-side column is blank or not
 * one of `A`/`M`/`D`/`R` (including malformed or short lines) are ignored.
 */
export function parseStatus(stdout: string): StatusEntry[] {
  const entries: StatusEntry[] = [];
  for (const line of stdout.split('\n')) {
    if (line.length < 4) continue;
    const code = line[1];
    if (code === undefined || !isStatusCode(code)) continue;
    const path = line.slice(3).trim();
    if (path === '') continue;
    entries.push({ path, code });
  }
  return entries;
}

function isStatusCode(value: string): value is StatusCode {
  return APPLY_CODES.has(value);
}
