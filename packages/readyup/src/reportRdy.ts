import { meetsThreshold } from './runRdy.ts';
import type { FixLocation, Progress, RdyReport, RdyResult, Severity } from './types.ts';
import { isPercentProgress } from './types.ts';

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

/** Build an icon-prefixed summary string, omitting counts that are zero. */
export function formatSummaryCounts(passed: number, failed: number, skipped: number): string {
  const parts: string[] = [];
  if (passed > 0) parts.push(`${ICON_PASSED} ${passed} passed`);
  if (failed > 0) parts.push(`${ICON_ERROR_FAILED} ${failed} failed`);
  if (skipped > 0) parts.push(`${ICON_SKIPPED_PRECONDITION} ${skipped} skipped`);
  return parts.join(', ');
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

/** Count passed, failed, and skipped results after N/A descendant suppression. */
function countResults(results: RdyResult[]): {
  passed: number;
  failed: number;
  skipped: number;
} {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of iterateWithNaSuppression(results)) {
    if (r.status === 'passed') passed++;
    else if (r.status === 'failed') failed++;
    else skipped++;
  }
  return { passed, failed, skipped };
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

  const { passed, failed, skipped } = countResults(visibleResults);
  lines.push('', `${formatSummaryCounts(passed, failed, skipped)} (${formatDuration(report.durationMs)})`);

  if (fixLocation === 'end' && collectedFixes.length > 0) {
    lines.push('', 'Fixes:', ...collectedFixes.map((fix) => `  ${ICON_FIX} ${fix}`));
  }

  return lines.join('\n');
}
