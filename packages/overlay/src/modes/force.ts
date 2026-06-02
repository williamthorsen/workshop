import { parseStatus } from '../chezmoi/parseStatus.ts';
import type { ChezmoiContext } from '../chezmoi/runChezmoi.ts';
import { runChezmoiCaptured, runChezmoiStreamed } from '../chezmoi/runChezmoi.ts';
import type { OverlayResult } from '../types.ts';
import { countOutcome, partitionStatus } from './buildEntries.ts';

/**
 * Full-convergence mode: a complete `chezmoi apply` that overwrites differing
 * files, performs native deletions, and runs `run_` scripts. Entries and counts
 * are built from a pre-apply `status` read (chezmoi emits no structured apply
 * report). A non-zero apply (typically a failing script) maps to exit `2`.
 */
export async function runForce(context: ChezmoiContext): Promise<OverlayResult> {
  const { stdout } = await runChezmoiCaptured(context, ['status']);
  const { entries, pendingScripts } = partitionStatus(parseStatus(stdout), { A: 'created', D: 'deleted', M: 'forced' });

  const applyCode = await runChezmoiStreamed(context, ['apply']);
  const ok = applyCode === 0;

  return {
    mode: 'force',
    entries,
    scripts: { ran: pendingScripts, ok },
    counts: {
      created: countOutcome(entries, 'created'),
      deleted: countOutcome(entries, 'deleted'),
      forced: countOutcome(entries, 'forced'),
      conflicts: 0,
      pending: 0,
    },
    exitCode: ok ? 0 : 2,
  };
}
