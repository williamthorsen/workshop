import type { CheckOutcome, FractionProgress } from '../types.ts';

/** Build a `CheckOutcome` with `FractionProgress` from expected vs. actual arrays. */
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
    detail: `Missing ${category}: ${missing.join(', ')}`,
    progress,
  };
}
