import type { PlanFingerprint } from '../schemas/plan-schemas.ts';
import type { Hash, TargetId } from '../schemas/scalar-schemas.ts';

/**
 * What became of one destination.
 *
 * `unchanged` covers both a destination the plan judged unchanged and one a previous apply already brought to the
 * planned body, the two being one fact on disk: nothing to write. `skipped-blocked` is a destination the plan refused
 * to compute content for, and `skipped-drifted` one holding neither side the plan recorded.
 */
export type FileAction = 'removed' | 'skipped-blocked' | 'skipped-drifted' | 'unchanged' | 'written';

/** What became of one destination, and what it holds afterwards. */
export interface AppliedFile {
  readonly targetId: TargetId;
  /** Posix-separated and relative to the target's root, as the plan records it. */
  readonly path: string;
  readonly action: FileAction;
  /** What the destination holds when the run ends, absent where it holds nothing. */
  readonly hash?: Hash;
  /** Why the destination was passed over, absent where it was not. */
  readonly reason?: string;
}

/** One directory a removal emptied and the run took away. */
export interface PrunedDirectory {
  readonly targetId: TargetId;
  /** Posix-separated and relative to the target's root. */
  readonly path: string;
}

/**
 * Everything one apply did, and the plan it did it from.
 *
 * `fingerprint` is the plan's own, so a persisted outcome identifies what it applied without keeping the plan beside
 * it. `files` runs in plan order, and `prunedDirs` deepest first, which is the order the directories were taken away
 * in and the order a replay would have to follow.
 *
 * A dry run fills the same shape. It reads every destination the real run reads and decides every action the same way,
 * writing nothing, so the two runs' records agree by construction rather than by a second code path kept in step.
 */
export interface ApplyOutcome {
  readonly fingerprint: PlanFingerprint;
  readonly dryRun: boolean;
  readonly files: ReadonlyArray<AppliedFile>;
  readonly prunedDirs: ReadonlyArray<PrunedDirectory>;
}
