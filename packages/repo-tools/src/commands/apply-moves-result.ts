import type { Move } from '../move/move-plan.ts';
import type { SettleEvent } from '../move/settle-move.ts';
import type { Reference } from '../references/find-references.ts';

/**
 * Returns the exit status of an `apply-moves` run: 1 when an entry was blocked or a move failed, and 0 otherwise.
 */
export function deriveApplyMovesStatus(result: ApplyMovesResult): number {
  return result.entries.some((entry) => entry.status === 'blocked' || entry.status === 'failed') ? 1 : 0;
}

/** Reports whether every registered clone on this machine was already at its registered path. */
export function isApplyMovesClean(result: ApplyMovesResult): boolean {
  return result.entries.every((entry) => entry.status === 'unchanged');
}

/** What an `apply-moves` run did, with absolute paths. Its JSON form is the output of `apply-moves --json`. */
export interface ApplyMovesResult {
  /** The entries with something to report, in registry order. */
  entries: EntryOutcome[];
  isDryRun: boolean;
  /** The clones and search paths that the reference search could not read. */
  problems: string[];
  /** The remaining references to the old paths. */
  references: Reference[];
  settlement: SettleEvent[];
}

/** What `apply-moves` did for one registry entry. */
export interface EntryOutcome {
  /** The entry's name, else its path. */
  entry: string;
  /** The former paths that are not the entry's clone, which the run ignored. */
  ignoredFormerPaths: string[];
  /** The worktrees that git lists and that are missing from disk, which the move skipped. */
  missingWorktrees: string[];
  /** The completed moves, or the planned ones under a dry run. */
  moves: Move[];
  /** The moves that a failure left unattempted. */
  notMoved: Move[];
  /** Why the entry was blocked, or why its move failed. */
  reasons: string[];
  /** `unchanged` marks an entry reported only for its ignored former paths. */
  status: 'blocked' | 'failed' | 'moved' | 'planned' | 'unchanged';
}
