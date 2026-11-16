import path from 'node:path';

import type { CloneAdapters } from '../commands/verb-run.ts';
import type { Move, MovePlan } from './move-plan.ts';

/** The operations with which `executeMove` changes the filesystem and git. */
export type ExecuteAdapters = Pick<CloneAdapters, 'makeDirectory' | 'renamePath' | 'repairWorktrees'>;

/**
 * Runs a plan's renames in order, creating each destination's missing parents, then repairs the worktree links. Stops
 * at the first failed rename and leaves the completed renames in place; once the primary has moved, it still repairs
 * the links, naming each worktree where it actually is.
 */
export function executeMove(plan: MovePlan, adapters: ExecuteAdapters): MoveOutcome {
  const completedMoves: Move[] = [];
  let renameFailure: string | undefined;
  let remainingMoves: Move[] = [];
  for (const [index, move] of plan.moves.entries()) {
    const failure = adapters.makeDirectory(path.dirname(move.to)) ?? adapters.renamePath(move.from, move.to);
    if (failure !== undefined) {
      renameFailure = `cannot move ${move.from} to ${move.to}: ${failure}`;
      remainingMoves = plan.moves.slice(index);
      break;
    }
    completedMoves.push(move);
  }
  const relocatedWorktrees = plan.relocatedWorktrees.filter((tree) =>
    completedMoves.includes(plan.moves.includes(tree) ? tree : plan.primary),
  );
  if (completedMoves.length === 0 || plan.repairedWorktrees.length === 0) {
    return { completedMoves, failure: renameFailure, relocatedWorktrees, remainingMoves };
  }

  const locatedWorktrees = plan.repairedWorktrees.map(
    (planned) => remainingMoves.find((move) => move.to === planned)?.from ?? planned,
  );
  const repairFailure = adapters.repairWorktrees(plan.primary.to, locatedWorktrees);
  const failures = [
    renameFailure,
    repairFailure === undefined ? undefined : `cannot repair the worktrees of ${plan.primary.to}: ${repairFailure}`,
  ].filter((failure) => failure !== undefined);
  return {
    completedMoves,
    failure: failures.length === 0 ? undefined : failures.join('; '),
    relocatedWorktrees,
    remainingMoves,
  };
}

/**
 * What `executeMove` did: the renames that completed, those that it did not attempt, and the first failure, with the
 * worktrees that moved: each completed rename's, and each one inside the primary once the primary has moved.
 */
export interface MoveOutcome {
  completedMoves: Move[];
  failure: string | undefined;
  relocatedWorktrees: Move[];
  remainingMoves: Move[];
}
