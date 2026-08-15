import { StaleSnapshotError } from '../../config/StaleSnapshotError.ts';
import type { CompositorConfig } from '../../schemas/config-schemas.ts';
import { assertSourcesFit } from '../../snapshot/assertSourcesFit.ts';
import type { CompositionSnapshot } from '../../snapshot/captureSnapshot.ts';
import type { TargetState } from '../../snapshot/readTargetState.ts';

/** A snapshot the plan flow can read: one whose destination scan was not skipped. */
export type PlannableSnapshot = CompositionSnapshot & { readonly targetState: ReadonlyArray<TargetState> };

/**
 * Refuses a snapshot that no longer describes `config`, so that no plan is composed against one.
 *
 * Two things put a snapshot out of date. A config whose adopted sources have moved is refused by `assertSourcesFit`,
 * which validate shares. A snapshot captured with the destination scan skipped has no current state to classify
 * against, and reading its absence as an empty destination would call every file `added` and leave apply reading
 * everything already on disk as drift.
 */
export function assertSnapshotFits(
  config: CompositorConfig,
  snapshot: CompositionSnapshot,
): asserts snapshot is PlannableSnapshot {
  if (snapshot.targetState === undefined) {
    throw new StaleSnapshotError(
      'The snapshot was captured without target state, which a plan classifies its files against. Capture again ' +
        'with the destination scan on.',
    );
  }

  assertSourcesFit(config, snapshot);
}
