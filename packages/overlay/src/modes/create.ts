import path from 'node:path';

import { parseStatus } from '../chezmoi/parseStatus.ts';
import { readStatus } from '../chezmoi/readStatus.ts';
import type { ChezmoiContext } from '../chezmoi/runChezmoi.ts';
import { runChezmoiStreamed } from '../chezmoi/runChezmoi.ts';
import type { OverlayResult } from '../types.ts';
import { countOutcome, partitionStatus } from './buildEntries.ts';

/**
 * Non-clobbering convergence: create missing entries (`A`), perform native
 * deletions (`D`), run `run_` scripts (`R`), and report differing files (`M`)
 * as conflicts that are never written.
 *
 * The `A`/`D` set is applied by *absolute* target path so chezmoi touches only
 * those entries. When that set is empty the targeted apply is skipped entirely
 * — a bare `chezmoi apply` would converge *every* file and clobber the `M`
 * entries the mode exists to protect. Scripts run in a separate
 * `--include=scripts` pass. Exit `2` if the file-apply or scripts pass failed,
 * else `1` if any conflicts exist, else `0`.
 */
export async function runCreate(context: ChezmoiContext): Promise<OverlayResult> {
  const { entries, pendingScripts } = partitionStatus(parseStatus(await readStatus(context)), {
    A: 'created',
    D: 'deleted',
    M: 'conflict',
  });

  const applyPaths = entries
    .filter((entry) => entry.outcome === 'created' || entry.outcome === 'deleted')
    .map((entry) => path.join(context.target, entry.path));

  const applyCode =
    applyPaths.length > 0
      ? await runChezmoiStreamed(context, ['apply', '--include=files,dirs,remove', '--', ...applyPaths])
      : 0;

  const scriptsCode = pendingScripts > 0 ? await runChezmoiStreamed(context, ['apply', '--include=scripts']) : 0;
  const ok = applyCode === 0 && scriptsCode === 0;
  const conflicts = countOutcome(entries, 'conflict');

  return {
    mode: 'create',
    entries,
    scripts: { ran: pendingScripts, ok: scriptsCode === 0 },
    counts: {
      created: countOutcome(entries, 'created'),
      deleted: countOutcome(entries, 'deleted'),
      forced: 0,
      conflicts,
      pending: 0,
    },
    exitCode: computeExitCode(ok, conflicts),
  };
}

function computeExitCode(ok: boolean, conflicts: number): 0 | 1 | 2 {
  if (!ok) return 2;
  if (conflicts > 0) return 1;
  return 0;
}
