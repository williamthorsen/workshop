/**
 * Returns the name in `names` closest to `input` by edit distance, when that distance is small enough to read as a
 * typo: at most a third of the input's length, and at least 1.
 */
export function findNearestName(input: string, names: readonly string[]): string | undefined {
  const limit = Math.max(1, Math.floor(input.length / 3));
  let nearest: { distance: number; name: string } | undefined;
  for (const name of names) {
    const distance = measureEditDistance(input, name);
    if (distance <= limit && (nearest === undefined || distance < nearest.distance)) nearest = { distance, name };
  }
  return nearest?.name;
}

// region | Helpers

/** Counts the single-character insertions, deletions, and substitutions that turn `a` into `b`. */
function measureEditDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i++) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const substitution = (previous[j] ?? 0) + (a.charAt(i) === b.charAt(j) ? 0 : 1);
      current.push(Math.min((previous[j + 1] ?? 0) + 1, (current[j] ?? 0) + 1, substitution));
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

// endregion | Helpers
