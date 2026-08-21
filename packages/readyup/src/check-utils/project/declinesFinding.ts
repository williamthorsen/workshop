/**
 * Matches either ignore pragma, capturing the `-next-line` suffix that moves what it covers to the following line.
 *
 * Both sides are bounded against a word character or a hyphen, so `rdy-ignored` and `rdy-ignore-nextline` are words
 * of their own rather than pragmas, while a token a block comment closes against without a space is a pragma.
 */
const IGNORE_PRAGMA = /(?<![\w-])rdy-ignore(-next-line)?(?![\w-])/g;

/**
 * Reports whether a source declines a finding on a line: an `rdy-ignore` sits on that line, or an
 * `rdy-ignore-next-line` on the one above it.
 *
 * Whatever follows the token -- the check ids it names, a `-- <reason>` tail, both, neither -- is accepted and read
 * no further. Lines are the source's raw text rather than blanked code, so a detector that blanks comments before it
 * scans cannot erase a pragma first.
 */
export function declinesFinding(lines: readonly string[], line: number): boolean {
  return carriesPragma(lines[line - 1], 'line') || carriesPragma(lines[line - 2], 'next-line');
}

// region | Helpers

/**
 * Reports whether a line carries a pragma covering the named scope. A line past either end of the source carries
 * none.
 */
function carriesPragma(line: string | undefined, scope: 'line' | 'next-line'): boolean {
  if (line === undefined) return false;

  for (const match of line.matchAll(IGNORE_PRAGMA)) {
    const covered = match[1] === undefined ? 'line' : 'next-line';
    if (covered === scope) return true;
  }
  return false;
}

// endregion | Helpers
