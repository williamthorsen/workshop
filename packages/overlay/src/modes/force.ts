import { parseStatus } from '../chezmoi/parseStatus.ts';
import { readStatus } from '../chezmoi/readStatus.ts';
import type { ChezmoiContext } from '../chezmoi/run-chezmoi.ts';
import { runChezmoiStreamed } from '../chezmoi/run-chezmoi.ts';
import { countOutcome, partitionStatus } from './entry-outcomes.ts';
import type { OverlayResult } from './types.ts';

/**
 * Full-convergence mode: a complete `chezmoi apply` that overwrites differing
 * files, performs native deletions, and runs `run_` scripts. Entries and counts
 * are built from a pre-apply `status` read (chezmoi emits no structured apply
 * report). A non-zero apply (typically a failing script) maps to exit `2`.
 */
export async function runForce(context: ChezmoiContext): Promise<OverlayResult> {
  const { entries, pendingScriptCount } = partitionStatus(parseStatus(await readStatus(context)), {
    A: 'created',
    D: 'deleted',
    M: 'forced',
  });

  const applyCode = await runChezmoiStreamed(context, ['apply']);
  const ok = applyCode === 0;

  return {
    mode: 'force',
    entries,
    scripts: { ranCount: pendingScriptCount, ok },
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
