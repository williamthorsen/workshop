import { computeClosure } from '../closure/computeClosure.ts';
import { compareStrings } from '../portable/compareStrings.ts';
import type { CompositorConfig } from '../schemas/config-schemas.ts';
import type { ArtifactId } from '../schemas/scalar-schemas.ts';
import { selectArtifacts } from '../selection/selectArtifacts.ts';
import { assertSourcesFit } from '../snapshot/assertSourcesFit.ts';
import type { CompositionSnapshot } from '../snapshot/captureSnapshot.ts';
import { findDeploymentCollisions } from './findDeploymentCollisions.ts';
import type { ValidationDiagnostic, ValidationReport } from './ValidationDiagnostic.ts';

/**
 * Reports every authoring fault a config and the content it reaches carry, each located where an author can fix it.
 *
 * Pure and synchronous, reading the snapshot alone. What a destination holds takes no part: the faults reported here
 * are in what someone wrote, and a report that moved with a destination would answer a different question each time it
 * ran. So a snapshot captured with the destination scan skipped validates as well as one captured with it, and the two
 * yield the same report.
 *
 * A snapshot whose adopted sources have moved is refused, as it is for a plan. The catalog ranks candidates by source
 * order, and the edge graph and the render matrix read the winning candidate alone, so a moved source set describes a
 * composition other than the one being asked about.
 *
 * Only what the config reaches is reported. The render matrix covers the whole catalog by design, so an artifact this
 * config does not select carries faults that are somebody else's to fix, and reporting them would bury the ones that
 * are not.
 *
 * Ordering is fixed, so two reports of one shape diff cleanly: selection in config order, closure in the order the
 * faults were found, render by target and then by artifact, deployment by target and then by path.
 */
export function validateComposition(config: CompositorConfig, snapshot: CompositionSnapshot): ValidationReport {
  assertSourcesFit(config, snapshot);

  const tiers = config.tiers.map(({ id, label }) => ({ id, label }));
  const selection = selectArtifacts(config, snapshot.catalog);
  const closure = computeClosure({ graph: snapshot.edgeGraph, selection, tiers });
  const reached = new Set(closure.artifacts.map(({ id }) => id));

  return {
    diagnostics: [
      ...selection.diagnostics.map((diagnostic) => ({ domain: 'selection' as const, diagnostic })),
      ...closure.diagnostics.map((diagnostic) => ({ domain: 'closure' as const, diagnostic })),
      ...collectRenderDiagnostics(snapshot, reached),
      ...findDeploymentCollisions({
        artifacts: closure.artifacts,
        kinds: closure.kinds,
        targets: snapshot.targets,
      }).map((diagnostic) => ({ domain: 'deployment' as const, diagnostic })),
    ],
  };
}

// region | Helpers

/** Collects what every render of a reached artifact could not resolve, by target and then by artifact. */
function collectRenderDiagnostics(
  snapshot: CompositionSnapshot,
  reached: ReadonlySet<ArtifactId>,
): Array<ValidationDiagnostic> {
  const targetIds = snapshot.targets.map(({ id }) => id).toSorted(compareStrings);

  return targetIds.flatMap((targetId): Array<ValidationDiagnostic> => {
    const column = snapshot.renders.get(targetId);
    if (column === undefined) {
      return [];
    }
    const rendered = [...column].toSorted(([left], [right]) => compareStrings(left, right));

    return rendered.flatMap(([artifactId, render]): Array<ValidationDiagnostic> => {
      const at = { targetId, artifactId };
      if (!reached.has(artifactId)) {
        return [];
      }
      if (render.status === 'failed') {
        return [{ domain: 'transclusion', at, diagnostic: render.diagnostic }];
      }
      if (render.status === 'not-deployed') {
        return [];
      }
      return render.diagnostics.map((diagnostic) => ({ domain: 'render', at, diagnostic }));
    });
  });
}

// endregion | Helpers
