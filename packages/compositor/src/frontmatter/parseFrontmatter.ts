/** An artifact split into the metadata block a target may overlay and the content beneath it. */
export interface ParsedFrontmatter {
  /** The block between the delimiters, without them, or `undefined` when the content opens with no block. */
  readonly frontmatter: string | undefined;
  /** Everything below the closing delimiter, or the whole content when there is no block. */
  readonly body: string;
}

/**
 * Splits `content` into its frontmatter block and its body.
 *
 * A block counts only when the content opens with a delimiter. Scanning for any two delimiter lines, as the ported
 * original did, claims a horizontal rule in a document that has no frontmatter at all and then rewrites the text above
 * it as metadata.
 *
 * Nothing is read out of the block. The original recovered an agent name from a `name:` field, which made the merge
 * depend on one consumer's vocabulary; the slug an overlay is keyed by belongs to the caller, which already knows
 * which artifact it is rendering.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const lines = content.split('\n');
  if (lines[0] !== '---') {
    return { frontmatter: undefined, body: content };
  }

  const closingIndex = lines.indexOf('---', 1);
  if (closingIndex === -1) {
    return { frontmatter: undefined, body: content };
  }

  return {
    frontmatter: lines.slice(1, closingIndex).join('\n'),
    body: lines.slice(closingIndex + 1).join('\n'),
  };
}
