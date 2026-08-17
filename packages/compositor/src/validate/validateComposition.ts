import { computeClosure } from '../closure/computeClosure.ts';
import type { BindingDiagnostic } from '../inlays/BindingDiagnostic.ts';
import { fillInlays } from '../inlays/fillInlays.ts';
import { findUnmatchedBindings } from '../inlays/findUnmatchedBindings.ts';
import { compareStrings } from '../portable/compareStrings.ts';
import type { ArtifactRender } from '../render/renderArtifact.ts';
import type { CompositorConfig } from '../schemas/config-schemas.ts';
import type { RenderTarget } from '../schemas/render-target-schemas.ts';
import type { ArtifactId, TargetId } from '../schemas/scalar-schemas.ts';
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
 * faults were found, render by target and then by artifact, binding by target and then by the order the fills ran,
 * with the config's own binding faults last among them, and deployment by target and then by path.
 *
 * The inlays are filled here as they are for a plan, over the same call, because a binding fault is only visible once
 * something tries to fill something: a report derived from the config and the sites alone would miss a filler the
 * target cannot deploy and one whose body declares an inlay of its own.
 */
export function validateComposition(config: CompositorConfig, snapshot: CompositionSnapshot): ValidationReport {
  assertSourcesFit(config, snapshot);

  const tiers = config.tiers.map(({ id, label }) => ({ id, label }));
  const selection = selectArtifacts(config, snapshot.catalog);
  const closure = computeClosure({ graph: snapshot.edgeGraph, selection, tiers });
  const reached = new Set(closure.artifacts.map(({ id }) => id));
  // Both collectors read one ordering, so neither reports in the order a consumer happened to declare its targets in.
  const targets = snapshot.targets.toSorted((left, right) => compareStrings(left.id, right.id));
  const fills = new Map(
    targets.map((target) => [
      target.id,
      fillInlays({
        target,
        renders: snapshot.renders.get(target.id) ?? new Map(),
        bindings: selection.bindings,
      }),
    ]),
  );

  return {
    diagnostics: [
      ...selection.diagnostics.map((diagnostic) => ({ domain: 'selection' as const, diagnostic })),
      ...closure.diagnostics.map((diagnostic) => ({ domain: 'closure' as const, diagnostic })),
      ...collectRenderDiagnostics(new Map([...fills].map(([id, fill]) => [id, fill.renders])), targets, reached),
      ...collectBindingDiagnostics(fills, targets, reached),
      ...findUnmatchedBindings({ bindings: selection.bindings, renders: snapshot.renders, reached }).map(
        (diagnostic) => ({ domain: 'binding' as const, diagnostic }),
      ),
      ...findDeploymentCollisions({ artifacts: closure.artifacts, kinds: closure.kinds, targets }).map(
        (diagnostic) => ({ domain: 'deployment' as const, diagnostic }),
      ),
    ],
  };
}

// region | Helpers

/**
 * Collects what each target's fill could not do, by target and then by the order the fills ran.
 *
 * Kept to the hosts the config reaches, on the rule the whole report follows: the render matrix covers the catalog by
 * design, so a fault against a body this config never deploys is somebody else's to fix.
 */
function collectBindingDiagnostics(
  fills: ReadonlyMap<TargetId, { diagnostics: ReadonlyArray<BindingDiagnostic> }>,
  targets: ReadonlyArray<RenderTarget>,
  reached: ReadonlySet<ArtifactId>,
): Array<ValidationDiagnostic> {
  return targets.flatMap(({ id }) =>
    (fills.get(id)?.diagnostics ?? [])
      .filter(({ at }) => at.hostArtifactId === undefined || reached.has(at.hostArtifactId))
      .map((diagnostic) => ({ domain: 'binding' as const, diagnostic })),
  );
}

/** Collects what every render of a reached artifact could not resolve, by target and then by artifact. */
function collectRenderDiagnostics(
  renders: ReadonlyMap<TargetId, ReadonlyMap<ArtifactId, ArtifactRender>>,
  targets: ReadonlyArray<RenderTarget>,
  reached: ReadonlySet<ArtifactId>,
): Array<ValidationDiagnostic> {
  return targets.flatMap(({ id: targetId }): Array<ValidationDiagnostic> => {
    const column = renders.get(targetId);
    if (column === undefined) {
      return [];
    }
    const rendered = [...column].toSorted(([left], [right]) => compareStrings(left, right));

    return rendered.flatMap(([artifactId, render]): Array<ValidationDiagnostic> => {
      const at = { targetId, artifactId };
      if (!reached.has(artifactId)) {
        return [];
      }
      if (render.status !== 'failed') {
        return render.status === 'not-deployed'
          ? []
          : render.diagnostics.map((diagnostic) => ({ domain: 'render', at, diagnostic }));
      }

      const failure = render.failure;
      switch (failure.stage) {
        case 'binding':
          return [{ domain: 'binding', diagnostic: failure.diagnostic }];
        case 'inlay':
          return [{ domain: 'inlay', at, diagnostic: failure.diagnostic }];
        case 'transclusion':
          return [{ domain: 'transclusion', at, diagnostic: failure.diagnostic }];
      }
    });
  });
}

// endregion | Helpers
