import { createIgnorePragmaMatcher } from './pragma-token.ts';

/** Matches one check id at the head of a pragma's tail, with the whitespace leading up to it. */
const LEADING_CHECK_ID = /^[ \t]*[A-Za-z0-9@][\w@./-]*/;

/** Matches the comma separating one check id from the next. */
const LEADING_COMMA = /^[ \t]*,/;

/** The tokens that open a pragma, which an id list therefore never names. */
const PRAGMA_TOKENS = new Set(['rdy-ignore', 'rdy-ignore-next-line']);

/**
 * Reports whether a source suppresses a finding on a line for a check `checkIds` names: an `rdy-ignore` sits on
 * that line, or an `rdy-ignore-next-line` on the one above it.
 *
 * A pragma naming no check suppresses whatever the check. One naming checks suppresses only where an id names a
 * member of `checkIds`, so a check declaring no id, which reaches here with none, is suppressed by the
 * unqualified form alone. Every pragma covering the line is read until one suppresses.
 *
 * Lines are the source's raw text rather than blanked code, so a detector that blanks comments before it scans
 * cannot erase a pragma first.
 */
export function suppressesFinding(lines: readonly string[], line: number, checkIds: readonly string[]): boolean {
  return carriesPragma(lines[line - 1], 'line', checkIds) || carriesPragma(lines[line - 2], 'next-line', checkIds);
}

// region | Helpers

/**
 * Reports whether a line has a pragma covering the named scope and suppressing for `checkIds`. A line past
 * either end of the source has none.
 */
function carriesPragma(line: string | undefined, scope: 'line' | 'next-line', checkIds: readonly string[]): boolean {
  if (line === undefined) return false;

  for (const match of line.matchAll(createIgnorePragmaMatcher())) {
    const covered = match[1] === undefined ? 'line' : 'next-line';
    if (covered !== scope) continue;

    const named = readCheckIds(line.slice(match.index + match[0].length));
    if (named.length === 0 || named.some((id) => checkIds.includes(id))) return true;
  }
  return false;
}

/**
 * Returns the check ids a pragma names, read from the text following its token.
 *
 * The list is comma-separated and ends at the first candidate that is not an id: a `--` opening a reason, the
 * delimiter closing a block comment, either pragma token, or the line's end. Excluding the pragma tokens by name
 * is what keeps a line with both of them two unqualified pragmas rather than one naming a check called
 * `rdy-ignore-next-line`.
 */
function readCheckIds(tail: string): readonly string[] {
  const ids: string[] = [];
  let rest = tail;

  for (;;) {
    const id = LEADING_CHECK_ID.exec(rest);
    if (id === null) return ids;

    const name = id[0].trimStart();
    if (PRAGMA_TOKENS.has(name)) return ids;

    ids.push(name);
    rest = rest.slice(id[0].length);

    const comma = LEADING_COMMA.exec(rest);
    if (comma === null) return ids;
    rest = rest.slice(comma[0].length);
  }
}

// endregion | Helpers
