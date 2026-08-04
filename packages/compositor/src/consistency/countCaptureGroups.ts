/**
 * Counts the capture groups `source` declares, or reports nothing when it does not compile.
 *
 * Alternating the pattern with an empty branch makes it match the empty string whatever it otherwise requires, so the
 * resulting array's length answers the question without a body to run it against.
 *
 * Shared by every declaration whose pattern captures exactly one thing -- the name a token resolves through, the
 * target a link points at. A pattern capturing none leaves nothing to resolve, and one capturing several leaves the
 * engine no way to tell which capture it meant.
 */
export function countCaptureGroups(source: string): number | undefined {
  try {
    return (new RegExp(`${source}|`).exec('')?.length ?? 1) - 1;
  } catch {
    return undefined;
  }
}
