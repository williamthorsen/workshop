import { getLayout } from './layout/engine.ts';
import { emptyCounts, mergeCounts } from './reportRdy.ts';
import type { ChecklistSummary, SummaryCounts } from './types.ts';

/** Returns the summary table for `summaries`, one row each, opening with a blank line. */
export function formatCombinedSummary(summaries: ChecklistSummary[]): string {
  const rows = summaries.map((summary) => ({
    name: summary.name,
    counts: summary,
    durationMs: summary.durationMs,
  }));

  return getLayout()
    .formatSummaryTable({
      rows,
      totals: aggregateCounts(summaries),
      totalDurationMs: summaries.reduce((sum, summary) => sum + summary.durationMs, 0),
    })
    .join('\n');
}

/** Returns the sum of every summary's counts, carrying the worst severity among them. */
function aggregateCounts(summaries: ChecklistSummary[]): SummaryCounts {
  const totals = emptyCounts();
  for (const summary of summaries) {
    mergeCounts(totals, summary);
  }
  return totals;
}
