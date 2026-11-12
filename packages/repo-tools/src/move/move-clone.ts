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
 * at the first failure and leaves the completed renames in place.
 */
export function executeMove(plan: MovePlan, adapters: ExecuteAdapters): MoveOutcome {
  const completed: Move[] = [];
  for (const [index, move] of plan.moves.entries()) {
    const failure = adapters.makeDirectory(path.dirname(move.to)) ?? adapters.renamePath(move.from, move.to);
    if (failure !== undefined) {
      return {
        completed,
        failure: `cannot move ${move.from} to ${move.to}: ${failure}`,
        remaining: plan.moves.slice(index),
      };
    }
    completed.push(move);
  }
  if (plan.repaired.length === 0) return { completed, failure: undefined, remaining: [] };
  const repairFailure = adapters.repairWorktrees(plan.primary.to, plan.repaired);
  return {
    completed,
    failure:
      repairFailure === undefined ? undefined : `cannot repair the worktrees of ${plan.primary.to}: ${repairFailure}`,
    remaining: [],
  };
}
