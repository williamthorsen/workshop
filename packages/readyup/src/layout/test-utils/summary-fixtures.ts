import type { SummaryCounts } from '../../kits/types.ts';
import type { SummaryRow } from '../layoutEngine.ts';

/** Returns zeroed counts with no worst severity, overlaid with `overrides`. */
export function makeCounts(overrides?: Partial<SummaryCounts>): SummaryCounts {
  return {
    passed: 0,
    errors: 0,
    warnings: 0,
    recommendations: 0,
    blocked: 0,
    optional: 0,
    worstSeverity: null,
    ...overrides,
  };
}

/** Returns a summary row for one passing check in a checklist named `name`, overlaid with `overrides`. */
export function makeRow({
  name = 'checklist',
  ...overrides
}: Partial<SummaryRow> & { name?: string } = {}): SummaryRow {
  return {
    counts: makeCounts({ passed: 1 }),
    durationMs: 100,
    segments: [{ role: 'checklist', text: name }],
    ...overrides,
  };
}
