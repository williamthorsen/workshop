import type { StatusCode, StatusEntry } from '../chezmoi/parseStatus.ts';
import type { EntryOutcome, OverlayEntry } from '../types.ts';

/** Maps each drift status code to the entry outcome a mode assigns it. `R` rows are handled separately. */
export type OutcomeMap = Partial<Record<StatusCode, EntryOutcome>>;

/** Result of partitioning status rows: per-entry outcomes and the count of pending `R` scripts. */
export interface PartitionedStatus {
  entries: OverlayEntry[];
  pendingScripts: number;
}

/**
 * Partition parsed status rows into overlay entries using a mode's outcome map.
 *
 * Rows whose code is absent from the map (other than `R`) are dropped; `R` rows are tallied into `pendingScripts`
 * rather than becoming entries.
 */
export function partitionStatus(status: StatusEntry[], outcomes: OutcomeMap): PartitionedStatus {
  const entries: OverlayEntry[] = [];
  let pendingScripts = 0;
  for (const entry of status) {
    if (entry.code === 'R') {
      pendingScripts += 1;
      continue;
    }
    const outcome = outcomes[entry.code];
    if (outcome !== undefined) {
      entries.push({ path: entry.path, outcome });
    }
  }
  return { entries, pendingScripts };
}

/** Count entries with the given outcome. */
export function countOutcome(entries: OverlayEntry[], outcome: EntryOutcome): number {
  return entries.filter((entry) => entry.outcome === outcome).length;
}
