import { formatSummaryCounts } from './reportRdy.ts';
import type { ChecklistSummary } from './types.ts';

const ICON_PASSED = '\u{1F7E2}';
const ICON_FAILED = '\u{1F534}';

/** Format a duration in milliseconds for display. */
function formatDuration(ms: number): string {
  return `${Math.round(ms)}ms`;
}

/** Format a single row's non-zero counts without icons. */
function formatRowCounts(summary: ChecklistSummary): string {
  const parts: string[] = [];
  if (summary.passed > 0) parts.push(`${summary.passed} passed`);
  if (summary.failed > 0) parts.push(`${summary.failed} failed`);
  if (summary.skipped > 0) parts.push(`${summary.skipped} skipped`);
  return parts.join(', ');
}

/** Format the combined summary table shown after multiple checklists run. */
export function formatCombinedSummary(summaries: ChecklistSummary[]): string {
  const HEADER =
    '\u2500\u2500 Summary \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';
  const lines: string[] = [HEADER];

  const maxNameLen = Math.max(...summaries.map((s) => s.name.length));
  const maxDurationLen = Math.max(...summaries.map((s) => formatDuration(s.durationMs).length));

  for (const summary of summaries) {
    const icon = summary.allPassed ? ICON_PASSED : ICON_FAILED;
    const name = summary.name.padEnd(maxNameLen);
    const duration = formatDuration(summary.durationMs).padStart(maxDurationLen);
    const counts = formatRowCounts(summary);
    lines.push(`${icon} ${name}  ${duration}  ${counts}`);
  }

  lines.push(
    '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
  );

  const totalPassed = summaries.reduce((sum, s) => sum + s.passed, 0);
  const totalFailed = summaries.reduce((sum, s) => sum + s.failed, 0);
  const totalSkipped = summaries.reduce((sum, s) => sum + s.skipped, 0);
  const totalDuration = summaries.reduce((sum, s) => sum + s.durationMs, 0);

  lines.push(
    `Total: ${formatSummaryCounts(totalPassed, totalFailed, totalSkipped)} (${formatDuration(totalDuration)})`,
  );

  return lines.join('\n');
}
