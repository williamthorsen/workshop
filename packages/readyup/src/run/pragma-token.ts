/**
 * Returns a matcher for either ignore pragma, capturing the `-next-line` suffix that moves what it covers to the
 * following line.
 *
 * Both sides are bounded against a word character or a hyphen, so `rdy-ignored` and `rdy-ignore-nextline` are words
 * of their own rather than pragmas, while a token a block comment closes against without a space is a pragma.
 *
 * A fresh matcher per scan, because a global regular expression carries a `lastIndex` its readers all share: one
 * `test` or `exec` anywhere would leave it set, and every later `matchAll` would skip the text before that offset
 * and answer that a pragma declining a finding is not there.
 */
export function createIgnorePragmaMatcher(): RegExp {
  return /(?<![\w-])rdy-ignore(-next-line)?(?![\w-])/g;
}
