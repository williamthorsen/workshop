/**
 * Matches either ignore pragma, capturing the `-next-line` suffix that moves what it covers to the following line.
 *
 * Both sides are bounded against a word character or a hyphen, so `rdy-ignored` and `rdy-ignore-nextline` are words
 * of their own rather than pragmas, while a token a block comment closes against without a space is a pragma.
 *
 * Shared by the two readers of a pragma: the one deciding whether a source declines a finding, and the one listing
 * the sites a run reports as having declined nothing. Both recognize the same token, and differ only in what they
 * require of the text around it.
 */
export const IGNORE_PRAGMA = /(?<![\w-])rdy-ignore(-next-line)?(?![\w-])/g;
