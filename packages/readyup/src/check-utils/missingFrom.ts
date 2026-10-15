import type { CheckOutcome, FractionProgress } from '../kits/types.ts';

const listFormat = new Intl.ListFormat('en', { type: 'conjunction' });

/**
 * Returns a `CheckOutcome` whose `FractionProgress` counts how many expected entries the actual list contains.
 *
 * Passes when nothing is missing, and otherwise names what was, under a fraction of how many were found. `category` is
 * a plural noun naming the collection, such as `files`, because the failure detail reads
 * `Of the files, a.txt is missing`.
 */
export function missingFrom(category: string, expected: readonly string[], actual: readonly string[]): CheckOutcome {
  const actualSet = new Set(actual);
  const missing = expected.filter((item) => !actualSet.has(item));
  const passedCount = expected.length - missing.length;

  const progress: FractionProgress = {
    type: 'fraction',
    passedCount,
    count: expected.length,
  };

  if (missing.length === 0) {
    return { ok: true, progress };
  }

  return {
    ok: false,
    detail: `Of the ${category}, ${listFormat.format(missing)} ${missing.length === 1 ? 'is' : 'are'} missing`,
    progress,
  };
}
