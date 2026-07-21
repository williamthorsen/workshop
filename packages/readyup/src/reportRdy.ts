import { meetsThreshold } from './runRdy.ts';
import type { FixLocation, Progress, RdyReport, RdyResult, Severity, SummaryCounts } from './types.ts';
import { isPercentProgress } from './types.ts';
import { pluralizeWithCount } from './utils/pluralize.ts';
import { worseSeverity } from './utils/severity.ts';

export const ICON_PASSED = '\u{1F7E2}';
export const ICON_ERROR_FAILED = '\u{1F534}';
export const ICON_WARN_FAILED = '\u{1F7E0}';
export const ICON_RECOMMEND_FAILED = '\u{1F7E1}';
export const ICON_SKIPPED_NA = '\u{23ED}\u{FE0F}';
export const ICON_SKIPPED_PRECONDITION = '\u{1F6AB}';
export const ICON_FIX = '\u{1F48A}';

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
 * Each segment is icon-prefixed and joined with `. `. Zero-count entries and empty groups are omitted.
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
  // The 3-space lead-in matches the icon+space width on the check line above,
  // so continuation text lands directly under the check name column.
  if (result.error !== null) {
    details.push(`   Error: ${result.error.message}`);
  }
  if (includeFix && result.fix !== null) {
    details.push(`   ${ICON_FIX} Fix: ${result.fix}`);
  }
  return details;
}

/** Create a zeroed `SummaryCounts` object. */
export function emptyCounts(): SummaryCounts {
  return {
    passed: 0,
    errors: 0,
    warnings: 0,
    recommendations: 0,
    blocked: 0,
    optional: 0,
    worstSeverity: null,
  };
}

/**
 * Count results by severity and skip reason.
 *
 * This is the only entry point for tallying a result list, and it expects the run's
 * complete results. The reporting threshold selects what is *displayed*; passing a
 * pre-filtered list here is what once made the human, table, and JSON counts disagree.
 */
export function countResults(results: RdyResult[]): SummaryCounts {
  const counts = emptyCounts();
  for (const r of results) {
    tallyResult(counts, r);
  }
  return counts;
}

/**
 * Selects the results a reporting threshold leaves visible, retaining the ancestors of every survivor.
 *
 * A result is visible when its own severity meets the threshold or when any of its descendants is visible, so a
 * surviving check is never rendered under a pruned parent. Assumes the contiguous depth-first ordering `runRdy`
 * produces: a result's descendants are exactly the run of deeper results that follows it.
 *
 * Visible results are returned in their original order.
 */
export function selectVisibleResults(results: RdyResult[], reportOn: Severity): RdyResult[] {
  const visible: RdyResult[] = [];
  // Scanning right to left, the nearest visible result is a descendant exactly when it is deeper, so its
  // depth alone decides whether the current result must be retained as an ancestor.
  let nearestVisibleDepth = -Infinity;

  for (const result of results.toReversed()) {
    if (!meetsThreshold(result.severity, reportOn) && nearestVisibleDepth <= result.depth) continue;
    visible.push(result);
    nearestVisibleDepth = result.depth;
  }

  return visible.toReversed();
}

/** Aggregates `source` counts into `target` in place, propagating the worse severity. */
export function mergeCounts(target: SummaryCounts, source: SummaryCounts): void {
  target.passed += source.passed;
  target.errors += source.errors;
  target.warnings += source.warnings;
  target.recommendations += source.recommendations;
  target.blocked += source.blocked;
  target.optional += source.optional;
  target.worstSeverity = worseSeverity(target.worstSeverity, source.worstSeverity);
}

/**
 * Update a `SummaryCounts` object in place with the contribution of a single result.
 *
 * Passed results increment `passed`. Failed results are bucketed by severity, and
 * `worstSeverity` is updated if the failure is more severe than the current worst.
 * Skipped results increment `blocked` (precondition) or `optional` (n/a).
 */
function tallyResult(counts: SummaryCounts, result: RdyResult): void {
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

/**
 * Format a readyup report as a human-readable string for terminal output.
 *
 * In `end` mode (default), errors appear inline but fix messages are collected in a "Fixes" section at the bottom.
 * In `inline` mode, error and fix messages appear directly below each failed check.
 * Results below the reporting threshold are omitted from the detail tree unless they are an ancestor of a
 * result that is shown; the summary counts always reflect the whole run.
 */
export function reportRdy(report: RdyReport, options?: ReportRdyOptions): string {
  const fixLocation = options?.fixLocation ?? 'end';
  const reportOn = options?.reportOn ?? 'recommend';
  const lines: string[] = [];
  const collectedFixes: string[] = [];

  const visibleResults = selectVisibleResults(report.results, reportOn);

  for (const result of visibleResults) {
    const indent = ' '.repeat(3).repeat(result.depth);
    const icon = getIcon(result);
    let checkLine = `${indent}${icon} ${result.name} (${formatDuration(result.durationMs)})`;
    if (result.detail !== null) {
      checkLine += ` \u{2014} ${result.detail}`;
    }
    if (result.progress !== null) {
      checkLine += ` \u{2014} ${formatProgress(result.progress)}`;
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

  const counts = countResults(report.results);
  lines.push('', `${formatSummaryCounts(counts)} (${formatDuration(report.durationMs)})`);

  if (fixLocation === 'end' && collectedFixes.length > 0) {
    lines.push('', 'Fixes:', ...collectedFixes.map((fix) => `  ${ICON_FIX} ${fix}`));
  }

  return lines.join('\n');
}
