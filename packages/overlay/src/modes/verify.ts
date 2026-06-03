import { parseStatus } from '../chezmoi/parseStatus.ts';
import { readStatus } from '../chezmoi/readStatus.ts';
import type { ChezmoiContext } from '../chezmoi/runChezmoi.ts';
import type { OverlayResult } from '../types.ts';
import { partitionStatus } from './buildEntries.ts';

/**
 * Read-only mode: report drift from a parsed `chezmoi status` and exit non-zero when any exists. Drift is any
 * `A`/`M`/`D` row. `R` rows (pending `run_` scripts) are surfaced informationally in `scripts.ran` but never affect
 * the verdict — overlay confirms *file convergence*, not *script execution*. This is why overlay parses `status`
 * instead of shelling out to `chezmoi verify`, which exits non-zero on pending scripts under throwaway
 * persistent-state.
 *
 * Drift entries carry the outcome they *would* have under `--create`: an `A` row reads as `created`, `D` as
 * `deleted`, and `M` as `conflict`.
 */
export async function runVerify(context: ChezmoiContext): Promise<OverlayResult> {
  const { entries, pendingScripts } = partitionStatus(parseStatus(await readStatus(context)), {
    A: 'created',
    D: 'deleted',
    M: 'conflict',
  });

  return {
    mode: 'verify',
    entries,
    scripts: { ran: pendingScripts, ok: true },
    counts: { created: 0, deleted: 0, forced: 0, conflicts: 0, pending: entries.length },
    exitCode: entries.length > 0 ? 1 : 0,
  };
}
