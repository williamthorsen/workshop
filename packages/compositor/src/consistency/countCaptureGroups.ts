/**
 * Counts the capture groups `source` declares, or undefined when it does not compile.
 *
 * Alternating the pattern with an empty branch makes it match the empty string whatever it otherwise requires, so the
 * resulting array's length gives the count without a body to run it against. The source is compiled as written
 * before that, since the appended branch can absorb a trailing escape: `^#\` fails on its own and compiles once the
 * backslash escapes the branch, so counting the alternated form alone would pass a pattern nothing can compile.
 *
 * Shared by every declaration whose pattern captures exactly one thing -- the name a token resolves through, the
 * target a link points at. A pattern capturing none leaves nothing to resolve, and one capturing several leaves the
 * engine no way to tell which capture it meant.
 */
export function countCaptureGroups(source: string): number | undefined {
  try {
    const declared = new RegExp(source);
    return (new RegExp(`${declared.source}|`).exec('')?.length ?? 1) - 1;
  } catch {
    return undefined;
  }
}
