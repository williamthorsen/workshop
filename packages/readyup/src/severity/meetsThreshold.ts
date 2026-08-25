import type { Severity } from '../kits/types.ts';

/**
 * Numeric rank for severity comparison. Lower rank = higher severity.
 *
 * A result "meets or exceeds" a threshold when its rank is <= the threshold's rank.
 */
const SEVERITY_RANK: Record<Severity, number> = {
  error: 0,
  warn: 1,
  recommend: 2,
};

/**
 * Reports whether `severity` is as severe as `threshold` or more so.
 *
 * Throws on a value outside the severity enum. Supplying a validated severity is the caller's
 * responsibility, and the throw is what makes that a contract rather than an assumption: an unranked
 * value compares as `undefined <= n`, which is false, so it would silently exclude the check from
 * both the failure and the reporting thresholds instead of failing loudly.
 */
export function meetsThreshold(severity: Severity, threshold: Severity): boolean {
  assertRankedSeverity(severity, 'severity');
  assertRankedSeverity(threshold, 'severity threshold');
  return SEVERITY_RANK[severity] <= SEVERITY_RANK[threshold];
}

// region | Helpers

/** Throws where a severity has no rank, naming the role it was supplied in. */
function assertRankedSeverity(severity: Severity, role: string): void {
  if (!Object.hasOwn(SEVERITY_RANK, severity)) {
    throw new Error(`Unknown ${role} "${severity}". Expected one of: error, warn, recommend.`);
  }
}

// endregion | Helpers
