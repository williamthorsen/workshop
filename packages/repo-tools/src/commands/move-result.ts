import type { Move } from '../move/move-plan.ts';
import type { SettleEvent } from '../move/settle-move.ts';
import type { Reference } from '../references/find-references.ts';

/** Returns the exit status of a `move` run: 1 when the move was blocked or failed or the registry write failed. */
export function deriveMoveStatus(result: MoveResult): number {
  if (result.status === 'blocked' || result.status === 'failed') return 1;
  return result.registry.status === 'failed' ? 1 : 0;
}

/** What a `move` run did, with absolute paths. Its JSON form is the output of `move --json`. */
export interface MoveResult {
  /** The entry's name. */
  entry: string;
  isDryRun: boolean;
  /** The worktrees that git lists and that are missing from disk, which the move skipped. */
  missingWorktrees: string[];
  /** The completed renames, or the planned ones under a dry run. */
  moves: Move[];
  /** The renames that a failure left unattempted. */
  notMoved: Move[];
  /** The clones and search paths that the reference search could not read. */
  problems: string[];
  /** Why the move was blocked, or why a rename failed. */
  reasons: string[];
  /** The remaining references to the old paths. */
  references: Reference[];
  registry: RegistryWrite;
  settlement: SettleEvent[];
  /** The outcome of the renames; a registry write that fails after them leaves it `moved`. */
  status: 'blocked' | 'failed' | 'moved' | 'planned';
}

/**
 * The write of the entry's new path to the registry. `path` and `formerPath` are the values as written, in their `~`
 * form when the registry uses it; `file` is the registry file at its location after the renames. `skipped` marks a run
 * in which no rename completed.
 */
export type RegistryWrite =
  | { file: string; formerPath: string; path: string; status: 'planned' | 'written' }
  | { file: string; formerPath: string; path: string; reason: string; status: 'failed' }
  | { status: 'skipped' };
