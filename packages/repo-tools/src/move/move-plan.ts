import path from 'node:path';

import type { CloneAdapters } from '../commands/verb-run.ts';
import type { LinkedWorktree } from '../git/git-clone.ts';

/** One directory rename. */
export interface Move {
  from: string;
  to: string;
}

/**
 * The renames that move a clone, the primary first, with the paths, after the move, of the linked worktrees whose
 * links need repair, and the worktrees that git lists but that are missing from disk.
 */
export interface MovePlan {
  moves: Move[];
  primary: Move;
  /** Every worktree whose path changes, the primary first: each renamed one and each one inside the primary. */
  relocated: Move[];
  repaired: string[];
  skipped: string[];
}

/** The probes with which `planMove` checks the filesystem. */
export type PlanAdapters = Pick<CloneAdapters, 'isDirectory' | 'pathExists' | 'readDeviceId'>;

/**
 * Plans the move of a clone's main worktree from `primary.from` to `primary.to`, or returns every reason to refuse it.
 * A linked worktree in the same parent directory whose basename extends the primary's with `.` moves beside the new
 * primary and keeps its suffix; one inside the primary moves with it; any other stays where it is. All paths are
 * absolute.
 */
export function planMove(
  primary: Move,
  worktrees: readonly LinkedWorktree[],
  adapters: PlanAdapters,
): MovePlan | string[] {
  const moves: Move[] = [primary];
  const relocated: Move[] = [primary];
  const repaired: string[] = [];
  const skipped: string[] = [];
  for (const worktree of worktrees) {
    if (worktree.isPrunable) {
      skipped.push(worktree.path);
      continue;
    }
    if (worktree.path.startsWith(`${primary.from}/`)) {
      const to = `${primary.to}${worktree.path.slice(primary.from.length)}`;
      relocated.push({ from: worktree.path, to });
      repaired.push(to);
      continue;
    }
    const suffix = readSiblingSuffix(primary.from, worktree.path);
    if (suffix === undefined) {
      repaired.push(worktree.path);
      continue;
    }
    const move = { from: worktree.path, to: `${primary.to}${suffix}` };
    moves.push(move);
    relocated.push(move);
    repaired.push(move.to);
  }

  const refusals = checkMoves(moves, adapters);
  return refusals.length > 0 ? refusals : { moves, primary, relocated, repaired, skipped };
}

// region | Helpers

/** Returns the reasons that the renames cannot all run, in the order of the moves. */
function checkMoves(moves: readonly Move[], adapters: PlanAdapters): string[] {
  const refusals: string[] = [];
  for (const move of moves) {
    if (!adapters.isDirectory(move.from)) {
      refusals.push(`${move.from} is not a directory`);
      continue;
    }
    if (move.to === move.from || move.to.startsWith(`${move.from}/`)) {
      refusals.push(`${move.to} is inside ${move.from}`);
      continue;
    }
    if (adapters.pathExists(move.to)) {
      refusals.push(`${move.to} already exists`);
      continue;
    }
    const ancestor = findExistingAncestor(move.to, adapters);
    if (adapters.readDeviceId(ancestor) !== adapters.readDeviceId(move.from)) {
      refusals.push(`${move.to} is on another filesystem than ${move.from}`);
    }
  }
  return refusals;
}

/** Returns the nearest ancestor of a path that exists. */
function findExistingAncestor(target: string, adapters: PlanAdapters): string {
  let current = path.dirname(target);
  while (!adapters.pathExists(current) && path.dirname(current) !== current) current = path.dirname(current);
  return current;
}

/**
 * Returns the suffix, such as `.live`, by which a worktree's path extends the primary's in the same parent directory,
 * or `undefined` when the worktree is not beside the primary.
 */
function readSiblingSuffix(primary: string, worktree: string): string | undefined {
  if (path.dirname(worktree) !== path.dirname(primary)) return undefined;
  const prefix = `${path.basename(primary)}.`;
  const name = path.basename(worktree);
  return name.startsWith(prefix) && name.length > prefix.length ? name.slice(prefix.length - 1) : undefined;
}

// endregion | Helpers
