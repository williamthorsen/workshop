import type { EntryOutcome, OverlayMode } from '../modes/types.ts';

/**
 * Describes an entry outcome as a human label, phrased for the mode that produced it.
 *
 * `verify` yields a preview (`would create`); `create` and `force` yield the resulting state (`created`). Consumers
 * composing their own report reuse this instead of re-deriving the preview-vs-applied wording from a mode-relative
 * outcome. Labels are unpadded: aligning a column belongs to whoever renders one.
 */
export function describeOutcome(outcome: EntryOutcome, mode: OverlayMode): string {
  const labels = OUTCOME_LABELS[outcome];
  return mode === 'verify' ? labels.preview : labels.applied;
}

/**
 * The `verify` and `create`/`force` label for each outcome. Labels name the entry's resulting state rather than an
 * action overlay took, which is the frame `conflict` fits: `forced` reads as `overwritten` because `--force` permits
 * the write rather than describing what happened to the path.
 */
const OUTCOME_LABELS: Record<EntryOutcome, { preview: string; applied: string }> = {
  created: { preview: 'would create', applied: 'created' },
  deleted: { preview: 'would delete', applied: 'deleted' },
  forced: { preview: 'would overwrite', applied: 'overwritten' },
  conflict: { preview: 'would conflict', applied: 'conflict' },
};
