import { findCloseMatch } from '@williamthorsen/toolbelt.strings/candidate';

/**
 * Finds the candidate that a bare word most likely misspells, or `undefined` when none is close enough.
 *
 * A word that abbreviates a candidate matches the shortest such candidate, before any typo is considered. Otherwise a
 * word matches the nearest candidate within two edits, counting a transposition as one, provided that it is fewer
 * edits away than the word has characters, so `ls` is too short to match `list`. Ties go to the earlier candidate in
 * `candidates`, so an alphabetized list yields an alphabetical tie-break. Words starting with `-` are flags, which the
 * argument parser reports on its own.
 */
export function findNearestWord(input: string, candidates: readonly string[]): string | undefined {
  if (input === '' || input.startsWith('-')) return undefined;

  return findShortestAbbreviated(input, candidates) ?? findCloseMatch(input, candidates);
}

// region | Helpers

/** Returns the shortest candidate that starts with `input`, ties going to the earlier one. */
function findShortestAbbreviated(input: string, candidates: readonly string[]): string | undefined {
  let shortest: string | undefined;
  for (const candidate of candidates) {
    if (candidate.startsWith(input) && (shortest === undefined || candidate.length < shortest.length)) {
      shortest = candidate;
    }
  }
  return shortest;
}

// endregion | Helpers
