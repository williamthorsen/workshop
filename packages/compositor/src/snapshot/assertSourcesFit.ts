import { foldSourceTiers } from '../config/foldSourceTiers.ts';
import { StaleSnapshotError } from '../config/StaleSnapshotError.ts';
import type { SourceSpec } from '../schemas/catalog-schemas.ts';
import type { CompositorConfig } from '../schemas/config-schemas.ts';
import type { CompositionSnapshot } from './captureSnapshot.ts';

/**
 * Refuses a snapshot whose adopted sources no longer describe `config`.
 *
 * A config that adds, drops, reorders, or remaps a source moves the catalog's ranking, and both the edge graph and the
 * render matrix read the winning candidate alone, so all three have to be captured afresh. What an edited config may
 * change against one snapshot is a selection.
 *
 * Re-folding is what makes the check cheap enough to run on every call: the fold is pure arithmetic over locations the
 * snapshot already carries.
 */
export function assertSourcesFit(config: CompositorConfig, snapshot: CompositionSnapshot): void {
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
    if (!namesOneSource(before, after)) {
      return `has ${describeSource(after)} where the snapshot has ${describeSource(before)}`;
    }
  }
  return undefined;
}

/** Reports whether two specs name one source, resolved the same way from the same declaration. */
function namesOneSource(left: SourceSpec, right: SourceSpec): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.dir === right.dir &&
    left.origin.kind === right.origin.kind &&
    left.origin.location === right.origin.location
  );
}

// endregion | Helpers
