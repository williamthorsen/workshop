import path from 'node:path';

import type { CloneAdapters } from '../commands/verb-run.ts';
import type { Move, MovePlan } from './move-plan.ts';

/** What `executeMove` did: the renames that completed, those that it did not attempt, and the first failure. */
export interface MoveOutcome {
  completed: Move[];
  failure: string | undefined;
  remaining: Move[];
}

/** The operations with which `executeMove` changes the filesystem and git. */
export type ExecuteAdapters = Pick<CloneAdapters, 'makeDirectory' | 'renamePath' | 'repairWorktrees'>;

/**
 * Runs a plan's renames in order, creating each destination's missing parents, then repairs the worktree links. Stops
 * at the first failed rename and leaves the completed renames in place; once the primary has moved, it still repairs
 * the links, naming each worktree where it actually is.
 */
export function executeMove(plan: MovePlan, adapters: ExecuteAdapters): MoveOutcome {
  const completed: Move[] = [];
  let renameFailure: string | undefined;
  let remaining: Move[] = [];
  for (const [index, move] of plan.moves.entries()) {
    const failure = adapters.makeDirectory(path.dirname(move.to)) ?? adapters.renamePath(move.from, move.to);
    if (failure !== undefined) {
      renameFailure = `cannot move ${move.from} to ${move.to}: ${failure}`;
      remaining = plan.moves.slice(index);
      break;
    }
    completed.push(move);
  }
  if (completed.length === 0 || plan.repaired.length === 0) return { completed, failure: renameFailure, remaining };

  const located = plan.repaired.map((planned) => remaining.find((move) => move.to === planned)?.from ?? planned);
  const repairFailure = adapters.repairWorktrees(plan.primary.to, located);
  const failures = [
    renameFailure,
    repairFailure === undefined ? undefined : `cannot repair the worktrees of ${plan.primary.to}: ${repairFailure}`,
  ].filter((failure) => failure !== undefined);
  return { completed, failure: failures.length === 0 ? undefined : failures.join('; '), remaining };
}
