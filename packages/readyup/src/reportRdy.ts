import { meetsThreshold } from './runRdy.ts';
import type { FixLocation, Progress, RdyReport, RdyResult, Severity, SummaryCounts } from './types.ts';
import { isPercentProgress } from './types.ts';
import { pluralizeWithCount } from './utils/pluralize.ts';

const ICON_PASSED = '\u{1F7E2}';
const ICON_ERROR_FAILED = '\u{1F534}';
const ICON_WARN_FAILED = '\u{1F7E0}';
const ICON_RECOMMEND_FAILED = '\u{1F7E1}';
const ICON_SKIPPED_NA = '\u26AA';
const ICON_SKIPPED_PRECONDITION = '\u26D4';
const ICON_FIX = '\u{1F48A}';

/** Options controlling how the report is formatted. */
export interface ReportRdyOptions {
  fixLocation?: FixLocation;
  reportOn?: Severity;
}

/** Format a duration in milliseconds for display. */
function formatDuration(ms: number): string {
  return `${Math.round(ms)}ms`;
}

/** Return the status icon for a result based on status, severity, and skip reason. */
function getIcon(result: RdyResult): string {
  if (result.status === 'passed') return ICON_PASSED;
  if (result.status === 'skipped') {
    return result.skipReason === 'precondition' ? ICON_SKIPPED_PRECONDITION : ICON_SKIPPED_NA;
  }
  // Failed result: icon depends on severity.
  if (result.severity === 'warn') return ICON_WARN_FAILED;
  if (result.severity === 'recommend') return ICON_RECOMMEND_FAILED;
  return ICON_ERROR_FAILED;
}

/** Format a progress value for display. */
function formatProgress(progress: Progress): string {
  if (isPercentProgress(progress)) {
    return `${progress.percent}%`;
  }
  return `${progress.passedCount} of ${progress.count}`;
}

/** Build a "Failed: ..." segment with per-severity counts. Returns null when nothing failed. */
function formatFailedSegment(counts: SummaryCounts, withIcons: boolean): string | null {
  const parts: string[] = [];
  if (counts.errors > 0) {
    const label = pluralizeWithCount(counts.errors, 'error');
    parts.push(withIcons ? `${ICON_ERROR_FAILED} ${label}` : label);
  }
  if (counts.warnings > 0) {
    const label = pluralizeWithCount(counts.warnings, 'warning');
    parts.push(withIcons ? `${ICON_WARN_FAILED} ${label}` : label);
  }
  if (counts.recommendations > 0) {
    const label = pluralizeWithCount(counts.recommendations, 'recommendation');
    parts.push(withIcons ? `${ICON_RECOMMEND_FAILED} ${label}` : label);
  }
  if (parts.length === 0) return null;
  return `Failed: ${parts.join(', ')}`;
}

/** Build a "Skipped: ..." segment with per-reason counts. Returns null when nothing was skipped. */
function formatSkippedSegment(counts: SummaryCounts, withIcons: boolean): string | null {
  const parts: string[] = [];
  if (counts.blocked > 0) {
    const label = pluralizeWithCount(counts.blocked, 'blocked', 'blocked');
    parts.push(withIcons ? `${ICON_SKIPPED_PRECONDITION} ${label}` : label);
  }
  if (counts.optional > 0) {
    const label = pluralizeWithCount(counts.optional, 'optional', 'optional');
    parts.push(withIcons ? `${ICON_SKIPPED_NA} ${label}` : label);
  }
  if (parts.length === 0) return null;
  return `Skipped: ${parts.join(', ')}`;
}

/**
 * Build an icon-prefixed summary string with per-severity failure counts and per-reason skip counts.
 *
 * Format: `🟢 N passed. Failed: 🔴 N error(s), 🟠 N warning(s), 🟡 N recommendation(s). Skipped: ⛔ N blocked, ⚪ N optional.`
 * Zero-count entries and empty groups are omitted.
 */
export function formatSummaryCounts(counts: SummaryCounts): string {
  return formatCounts(counts, true);
}

/**
 * Build a summary string with the same granular format as `formatSummaryCounts` but
 * without inline severity icons, for use in combined-summary table rows.
 */
export function formatSummaryCountsPlain(counts: SummaryCounts): string {
  return formatCounts(counts, false);
}

/** Shared implementation for formatting granular summary counts, with or without icons. */
function formatCounts(counts: SummaryCounts, withIcons: boolean): string {
  const segments: string[] = [];

  if (counts.passed > 0) {
    const passedLabel = pluralizeWithCount(counts.passed, 'passed', 'passed');
    segments.push(withIcons ? `${ICON_PASSED} ${passedLabel}` : passedLabel);
  }

  const failedSegment = formatFailedSegment(counts, withIcons);
  if (failedSegment !== null) segments.push(failedSegment);

  const skippedSegment = formatSkippedSegment(counts, withIcons);
  if (skippedSegment !== null) segments.push(skippedSegment);

  return segments.join('. ');
}

/** Collect inline detail lines (error and/or fix) for a failed result. */
function collectInlineDetails(result: RdyResult, includeFix: boolean): string[] {
  const details: string[] = [];
  if (result.error !== null) {
    details.push(`  Error: ${result.error.message}`);
  }
  if (includeFix && result.fix !== null) {
    details.push(`  ${ICON_FIX} Fix: ${result.fix}`);
  }
  return details;
}

/** Iterate visible results, skipping N/A descendants (depth > N/A parent). */
function* iterateWithNaSuppression(results: RdyResult[]): Generator<RdyResult> {
  let suppressBelowDepth: number | null = null;
  for (const result of results) {
    if (suppressBelowDepth !== null) {
      if (result.depth > suppressBelowDepth) continue;
      suppressBelowDepth = null;
    }
    if (result.status === 'skipped' && result.skipReason === 'n/a') {
      suppressBelowDepth = result.depth;
    }
    yield result;
  }
}

/** Count results by severity and skip reason after N/A descendant suppression. */
function countResults(results: RdyResult[]): SummaryCounts {
  const counts: SummaryCounts = {
    passed: 0,
    errors: 0,
    warnings: 0,
    recommendations: 0,
    blocked: 0,
    optional: 0,
    worstSeverity: null,
  };
  for (const r of iterateWithNaSuppression(results)) {
    tallyResult(counts, r);
  }
  return counts;
}

/**
 * Update a `SummaryCounts` object in place with the contribution of a single result.
 *
 * Passed results increment `passed`. Failed results are bucketed by severity, and
 * `worstSeverity` is updated if the failure is more severe than the current worst.
 * Skipped results increment `blocked` (precondition) or `optional` (n/a).
 */
export function tallyResult(counts: SummaryCounts, result: RdyResult): void {
  if (result.status === 'passed') {
    counts.passed++;
    return;
  }
  if (result.status === 'failed') {
    if (result.severity === 'error') counts.errors++;
    else if (result.severity === 'warn') counts.warnings++;
    else counts.recommendations++;
    counts.worstSeverity = worseSeverity(counts.worstSeverity, result.severity);
    return;
  }
  if (result.skipReason === 'precondition') counts.blocked++;
  else counts.optional++;
}

/** Return the more severe of two severity values. `error` > `warn` > `recommend` > `null`. */
function worseSeverity(current: Severity | null, candidate: Severity): Severity {
  if (current === 'error' || candidate === 'error') return 'error';
  if (current === 'warn' || candidate === 'warn') return 'warn';
  return 'recommend';
}

/**
 * Format a readyup report as a human-readable string for terminal output.
 *
 * In `end` mode (default), errors appear inline but fix messages are collected in a "Fixes" section at the bottom.
 * In `inline` mode, error and fix messages appear directly below each failed check.
 * Results below the reporting threshold are omitted from output.
 */
export function reportRdy(report: RdyReport, options?: ReportRdyOptions): string {
  const fixLocation = options?.fixLocation ?? 'end';
  const reportOn = options?.reportOn ?? 'recommend';
  const lines: string[] = [];
  const collectedFixes: string[] = [];

  const visibleResults = report.results.filter((r) => meetsThreshold(r.severity, reportOn));

  for (const result of iterateWithNaSuppression(visibleResults)) {
    const indent = '  '.repeat(result.depth);
    const icon = getIcon(result);
    let checkLine = `${indent}${icon} ${result.name} (${formatDuration(result.durationMs)})`;
    if (result.detail !== null) {
      checkLine += ` \u2014 ${result.detail}`;
    }
    if (result.progress !== null) {
      checkLine += ` \u2014 ${formatProgress(result.progress)}`;
    }
    lines.push(checkLine);

    if (result.status === 'failed') {
      const includeFix = fixLocation === 'inline';
      const details = collectInlineDetails(result, includeFix);
      lines.push(...details.map((line) => `${indent}${line}`));

      if (!includeFix && result.fix !== null) {
        collectedFixes.push(result.fix);
      }
    }
  }

  const counts = countResults(visibleResults);
  lines.push('', `${formatSummaryCounts(counts)} (${formatDuration(report.durationMs)})`);

  if (fixLocation === 'end' && collectedFixes.length > 0) {
    lines.push('', 'Fixes:', ...collectedFixes.map((fix) => `  ${ICON_FIX} ${fix}`));
  }

  return lines.join('\n');
}
