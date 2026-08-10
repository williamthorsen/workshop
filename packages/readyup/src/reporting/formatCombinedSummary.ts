import type { SummaryCounts } from '../kits/types.ts';
import { getLayout } from '../layout/engine.ts';
import type { SummaryRow } from '../layout/layoutEngine.ts';
import { emptyCounts, mergeCounts } from './reportRdy.ts';

/** Returns the summary table for `rows`, one row each, carrying no separation of its own. */
export function formatCombinedSummary(rows: SummaryRow[]): string {
  return getLayout()
    .formatSummaryTable({
      rows,
      totals: aggregateCounts(rows),
      totalDurationMs: rows.reduce((sum, row) => sum + row.durationMs, 0),
    })
    .join('\n');
}

// region | Helpers

/** Returns the sum of every row's counts, carrying the worst severity among them. */
function aggregateCounts(rows: SummaryRow[]): SummaryCounts {
  const totals = emptyCounts();
  for (const row of rows) {
    mergeCounts(totals, row.counts);
  }
  return totals;
}

// endregion | Helpers
