/** Edits (insertions, deletions, or substitutions) a word may be from a candidate and still match it. */
const MAX_TYPO_DISTANCE = 2;

/**
 * Finds the candidate a bare word most likely misspells, or `undefined` when none is close enough.
 *
 * A word qualifies by abbreviating a candidate or by sitting within a couple of edits of one, so a
 * transposed or wrong letter is caught alongside a truncation. Ties go to the nearest candidate and then
 * to the earlier one in `candidates`, so an alphabetized list yields an alphabetical tie-break. Words
 * starting with `-` are flags, which the argument parser reports on its own.
 */
export function findNearestWord(input: string, candidates: readonly string[]): string | undefined {
  if (input === '' || input.startsWith('-')) return undefined;

  let best: { candidate: string; distance: number } | undefined;
  for (const candidate of candidates) {
    const distance = measureEditDistance(input, candidate);
    const isCandidate = distance <= MAX_TYPO_DISTANCE || candidate.startsWith(input);
    if (isCandidate && (best === undefined || distance < best.distance)) {
      best = { candidate, distance };
    }
  }
  return best?.candidate;
}

// region | Helpers

/** Computes the Levenshtein edit distance between two words. */
function measureEditDistance(source: string, target: string): number {
  const targetCharacters = Array.from(target);

  // Each row holds the distance from one prefix of the source to every non-empty prefix of the
  // target. Column zero is held in a scalar rather than the row because its value is always the
  // row's own index, which keeps every read a plain iteration.
  let previousRow = targetCharacters.map((character, index) => ({ character, distance: index + 1 }));

  for (const [rowIndex, sourceCharacter] of Array.from(source).entries()) {
    let diagonal = rowIndex;
    let left = rowIndex + 1;
    const currentRow: typeof previousRow = [];

    for (const { character, distance: above } of previousRow) {
      const substitution = diagonal + (sourceCharacter === character ? 0 : 1);
      const distance = Math.min(above + 1, left + 1, substitution);
      currentRow.push({ character, distance });
      diagonal = above;
      left = distance;
    }

    previousRow = currentRow;
  }

  // An empty target leaves every row empty, and the distance is then the source's length alone.
  return previousRow.at(-1)?.distance ?? source.length;
}

// endregion | Helpers
