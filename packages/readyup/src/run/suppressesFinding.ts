import { createIgnorePragmaMatcher, readCheckIds } from './pragma-token.ts';

/**
 * Reports whether a source suppresses a finding on a line for a check named by `checkIds`: An `rdy-ignore` is on
 * that line, or an `rdy-ignore-next-line` on the one above it.
 *
 * A pragma naming no check suppresses whatever the check. One naming checks suppresses only when an id names a
 * member of `checkIds`, so a check declaring no id, for which `checkIds` is empty, is suppressed by the
 * unqualified form alone. Every pragma covering the line is read until one suppresses.
 *
 * Lines are the source's raw text rather than blanked code: A detector that blanks comments before it scans
 * cannot erase a pragma first.
 */
export function suppressesFinding(lines: readonly string[], line: number, checkIds: readonly string[]): boolean {
  return hasPragma(lines[line - 1], 'line', checkIds) || hasPragma(lines[line - 2], 'next-line', checkIds);
}

// region | Helpers

/**
 * Reports whether a line has a pragma covering the named scope and suppressing for `checkIds`. A line past
 * either end of the source has none.
 */
function hasPragma(line: string | undefined, scope: 'line' | 'next-line', checkIds: readonly string[]): boolean {
  if (line === undefined) return false;

  for (const match of line.matchAll(createIgnorePragmaMatcher())) {
    const covered = match[1] === undefined ? 'line' : 'next-line';
    if (covered !== scope) continue;

    const named = readCheckIds(line.slice(match.index + match[0].length));
    if (named.length === 0 || named.some((id) => checkIds.includes(id))) return true;
  }
  return false;
}

// endregion | Helpers
