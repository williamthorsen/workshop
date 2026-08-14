import { foldSourceTiers } from '../../config/foldSourceTiers.ts';
import { StaleSnapshotError } from '../../config/StaleSnapshotError.ts';
import type { SourceSpec } from '../../schemas/catalog-schemas.ts';
import type { CompositorConfig } from '../../schemas/config-schemas.ts';
import type { CompositionSnapshot } from '../../snapshot/captureSnapshot.ts';
import type { TargetState } from '../../snapshot/readTargetState.ts';

/** A snapshot the plan flow can read: one whose destination scan was not skipped. */
export type PlannableSnapshot = CompositionSnapshot & { readonly targetState: ReadonlyArray<TargetState> };

/**
 * Refuses a snapshot that no longer describes `config`, so that no plan is composed against one.
 *
 * Two things put a snapshot out of date. A config that adds, drops, reorders, or remaps a source moves the catalog's
 * ranking, and both the edge graph and the render matrix read the winning candidate alone, so all three have to be
 * captured afresh; what an edited config may change against one snapshot is a selection. A snapshot captured with the
 * destination scan skipped has no current state to classify against, and reading its absence as an empty destination
 * would call every file `added` and leave apply reading everything already on disk as drift.
 *
 * Re-folding is what makes the first check cheap enough to run on every compose: the fold is pure arithmetic over
 * locations the snapshot already carries.
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

  const folded = foldSourceTiers(config, snapshot.locations);
  const move = findMove(snapshot.resolution.sources, folded.sources);
  if (move !== undefined) {
    throw new StaleSnapshotError(
      `The config's adopted sources have moved since the snapshot was captured: it ${move}. The catalog ranks ` +
        'candidates by source order, and the edge graph and the render matrix read the winning candidate alone, so a ' +
        'moved source set has to be captured afresh.',
    );
  }
}

// region | Helpers

/** Renders one source as the identity that decides whether a snapshot still describes it. */
function describeSource(source: SourceSpec): string {
  return `"${source.id}" (${source.origin.kind} "${source.origin.location}" at "${source.dir}")`;
}

/** Finds the first position at which the folded sources depart from the captured ones, in the config's own order. */
function findMove(captured: ReadonlyArray<SourceSpec>, folded: ReadonlyArray<SourceSpec>): string | undefined {
  for (let index = 0; index < Math.max(captured.length, folded.length); index += 1) {
    const before = captured.at(index);
    const after = folded.at(index);

    if (before === undefined) {
      return after === undefined ? undefined : `adopts ${describeSource(after)}, which the snapshot does not carry`;
    }
    if (after === undefined) {
      return `no longer adopts ${describeSource(before)}`;
    }
    if (!isSameSource(before, after)) {
      return `has ${describeSource(after)} where the snapshot has ${describeSource(before)}`;
    }
  }
  return undefined;
}

/** Reports whether two specs name one source, resolved the same way from the same declaration. */
function isSameSource(left: SourceSpec, right: SourceSpec): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.dir === right.dir &&
    left.origin.kind === right.origin.kind &&
    left.origin.location === right.origin.location
  );
}

// endregion | Helpers
