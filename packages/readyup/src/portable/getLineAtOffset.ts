/**
 * Returns the 1-based line holding an offset.
 *
 * Counts from 1 because a reported line names a line that a reader opens in an editor, which is what
 * `buildFindingReport` renders as `path:line`. A line break belongs to the line that it ends, so the offset
 * just past it begins the next.
 *
 * An offset taken from a text produced by `blankNonCode` reads the same line here as the source from which it
 * came, because blanking preserves the source's length and every line-break position.
 */
export function getLineAtOffset(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === '\n') line += 1;
  }
  return line;
}
