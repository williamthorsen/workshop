import { formatSummaryCounts, formatSummaryCountsPlain } from './reportRdy.ts';
import type { ChecklistSummary, Severity, SummaryCounts } from './types.ts';

const ICON_PASSED = '\u{1F7E2}';
const ICON_ERROR_FAILED = '\u{1F534}';
const ICON_WARN_FAILED = '\u{1F7E0}';
const ICON_RECOMMEND_FAILED = '\u{1F7E1}';

/** Format a duration in milliseconds for display. */
function formatDuration(ms: number): string {
  return `${Math.round(ms)}ms`;
}

/** Format a single row's granular non-zero counts without inline icons. */
function formatRowCounts(summary: ChecklistSummary): string {
  return formatSummaryCountsPlain(summary);
}

/** Return the row-level icon reflecting the worst failed severity in a summary. */
function getRowIcon(worstSeverity: Severity | null): string {
  if (worstSeverity === 'error') return ICON_ERROR_FAILED;
  if (worstSeverity === 'warn') return ICON_WARN_FAILED;
  if (worstSeverity === 'recommend') return ICON_RECOMMEND_FAILED;
  return ICON_PASSED;
}

/** Return the more severe of two severity values. `error` > `warn` > `recommend` > `null`. */
function worseSeverity(current: Severity | null, candidate: Severity | null): Severity | null {
  if (current === 'error' || candidate === 'error') return 'error';
  if (current === 'warn' || candidate === 'warn') return 'warn';
  if (current === 'recommend' || candidate === 'recommend') return 'recommend';
  return null;
}

/** Sum granular counts across multiple summaries, propagating the worst severity. */
function aggregateCounts(summaries: ChecklistSummary[]): SummaryCounts {
  const totals: SummaryCounts = {
    passed: 0,
    errors: 0,
    warnings: 0,
    recommendations: 0,
    blocked: 0,
    optional: 0,
    worstSeverity: null,
  };
  for (const s of summaries) {
    totals.passed += s.passed;
    totals.errors += s.errors;
    totals.warnings += s.warnings;
    totals.recommendations += s.recommendations;
    totals.blocked += s.blocked;
    totals.optional += s.optional;
    totals.worstSeverity = worseSeverity(totals.worstSeverity, s.worstSeverity);
  }
  return totals;
}

/** Format the combined summary table shown after multiple checklists run. */
export function formatCombinedSummary(summaries: ChecklistSummary[]): string {
  const HEADER =
    '\u2500\u2500 Summary \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';
  const lines: string[] = [HEADER];

  const maxNameLen = Math.max(...summaries.map((s) => s.name.length));
  const maxDurationLen = Math.max(...summaries.map((s) => formatDuration(s.durationMs).length));

  for (const summary of summaries) {
    const icon = getRowIcon(summary.worstSeverity);
    const name = summary.name.padEnd(maxNameLen);
    const duration = formatDuration(summary.durationMs).padStart(maxDurationLen);
    const counts = formatRowCounts(summary);
    lines.push(`${icon} ${name}  ${duration}  ${counts}`);
  }

  lines.push(
    '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
  );

  const totals = aggregateCounts(summaries);
  const totalDuration = summaries.reduce((sum, s) => sum + s.durationMs, 0);

  lines.push(`Total: ${formatSummaryCounts(totals)} (${formatDuration(totalDuration)})`);

  return lines.join('\n');
}
