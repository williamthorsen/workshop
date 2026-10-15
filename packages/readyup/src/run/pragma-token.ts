/** Matches one check id at the head of a pragma's tail, with the whitespace leading up to it. */
const LEADING_CHECK_ID = /^[ \t]*[A-Za-z0-9@][\w@./-]*/;

/** Matches the comma separating one check id from the next. */
const LEADING_COMMA = /^[ \t]*,/;

/** The tokens that open a pragma, which an id list therefore never names. */
const PRAGMA_TOKENS = new Set(['rdy-ignore', 'rdy-ignore-next-line']);

/**
 * Returns a matcher for either ignore pragma, capturing the `-next-line` suffix that moves what it covers to the
 * following line.
 *
 * Both sides are bounded against a word character or a hyphen, so `rdy-ignored` and `rdy-ignore-nextline` are words
 * of their own rather than pragmas, while a token against which a block comment closes without a space is a pragma.
 *
 * A fresh matcher per scan, because a global regular expression has a `lastIndex` shared by all its readers: One
 * `test` or `exec` anywhere would leave it set, and every later `matchAll` would skip the text before that offset
 * and report that a pragma suppressing a finding is not there.
 */
export function createIgnorePragmaMatcher(): RegExp {
  return /(?<![\w-])rdy-ignore(-next-line)?(?![\w-])/g;
}

/**
 * Returns the check ids named by a pragma, read from the text following its token.
 *
 * The list is comma-separated and ends at the first candidate that is not an id: a `--` opening a reason, the
 * delimiter closing a block comment, either pragma token, or the line's end. Excluding the pragma tokens by name
 * keeps a line with both of them two unqualified pragmas rather than one naming a check called
 * `rdy-ignore-next-line`.
 */
export function readCheckIds(tail: string): readonly string[] {
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
