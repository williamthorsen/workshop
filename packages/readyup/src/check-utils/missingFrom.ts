import type { CheckOutcome, FractionProgress } from '../kits/types.ts';

/**
 * Returns a `CheckOutcome` whose `FractionProgress` counts how many expected entries the actual list holds.
 *
 * Passes where nothing is missing, and otherwise names what was, under a fraction of how many were found.
 */
export function missingFrom(category: string, expected: string[], actual: string[]): CheckOutcome {
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
    detail: `missing ${category}: ${missing.join(', ')}`,
    progress,
  };
}
