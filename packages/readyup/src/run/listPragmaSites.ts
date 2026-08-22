import { blankComments } from '../portable/blankNonCode.ts';
import { getLineAtOffset } from '../portable/getLineAtOffset.ts';
import { IGNORE_PRAGMA } from './pragma-token.ts';

/** One pragma a source carries, and the line it covers. */
export interface PragmaSite {
  /** The 1-based line the token sits on. */
  readonly line: number;

  /** The 1-based line the pragma declines a finding on. */
  readonly coveredLine: number;

  /** The token as written, which is what a report names it by. */
  readonly token: string;
}

/** Characters a comment may hold between its opening delimiter and a pragma anchored to it. */
const ANCHOR_GAP = /[ \t\r\n*]/;

/**
 * Returns the pragmas a source anchors to a comment's opening delimiter.
 *
 * A token qualifies where it sits inside a comment and nothing but whitespace and `*` parts it from the `//` or
 * `/*` that opened one. That is stricter than declining, which matches the token in raw text wherever it appears:
 * a report naming a site has to be sure the comment is a pragma rather than prose quoting one, so a token
 * following anything else in its comment, or a second token on a line, is withheld rather than guessed at.
 *
 * `blankComments` is the comment oracle, no second tokenizer being needed to answer a question it already answers.
 * It preserves its input's length, so an offset found in the raw text reads the blanked text at the same place.
 *
 * Reads JavaScript-family syntax; a source in another language yields arbitrary output, as it does from the
 * blanking itself.
 */
export function listPragmaSites(text: string): readonly PragmaSite[] {
  const blanked = blankComments(text);
  const sites: PragmaSite[] = [];

  for (const match of text.matchAll(IGNORE_PRAGMA)) {
    if (!isCommentAnchored(text, blanked, match.index)) continue;

    const line = getLineAtOffset(text, match.index);
    sites.push({ coveredLine: match[1] === undefined ? line : line + 1, line, token: match[0] });
  }

  return sites;
}

/** Reports whether a path names a source whose pragmas this module recognizes. */
export function isJsFamilyPath(path: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(path);
}

// region | Helpers

/** Reports whether a token at an offset sits in a comment, parted from its opening delimiter by nothing else. */
function isCommentAnchored(text: string, blanked: string, offset: number): boolean {
  // A comment blanks whole, its delimiters included, so a blank at the token's own offset is what places it in one.
  if (blanked[offset] !== ' ') return false;

  let index = offset;
  while (index > 0 && ANCHOR_GAP.test(text[index - 1] ?? '')) index -= 1;

  // A line comment leaves `//` immediately before the gap; a block comment's `/` sits one further back, its `*`
  // having been walked over as part of the gap.
  const isLineComment = text[index - 2] === '/' && text[index - 1] === '/';
  const isBlockComment = text[index - 1] === '/' && text[index] === '*';
  return isLineComment || isBlockComment;
}

// endregion | Helpers
