import { layout } from './layout/engine.ts';
import { emptyCounts, mergeCounts } from './reportRdy.ts';
import type { ChecklistSummary, SummaryCounts } from './types.ts';

/**
 * Format the combined summary table shown after multiple checklists run.
 *
 * Leads with the heading's own blank line, so a caller appends it directly to the report above.
 */
export function formatCombinedSummary(summaries: ChecklistSummary[]): string {
  const rows = summaries.map((summary) => ({
    name: summary.name,
    counts: summary,
    durationMs: summary.durationMs,
  }));

  return layout
    .formatSummaryTable({
      rows,
      totals: aggregateCounts(summaries),
      totalDurationMs: summaries.reduce((sum, summary) => sum + summary.durationMs, 0),
    })
    .join('\n');
}

/** Sum granular counts across multiple summaries, propagating the worst severity. */
function aggregateCounts(summaries: ChecklistSummary[]): SummaryCounts {
  const totals = emptyCounts();
  for (const summary of summaries) {
    mergeCounts(totals, summary);
  }
  return totals;
}
