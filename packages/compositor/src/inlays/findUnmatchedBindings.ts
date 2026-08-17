import type { ArtifactRender } from '../render/renderArtifact.ts';
import type { ArtifactId, TargetId } from '../schemas/scalar-schemas.ts';
import type { InlayBinding } from '../selection/selectArtifacts.ts';
import type { BindingDiagnostic } from './BindingDiagnostic.ts';

/** What finding the bindings nothing declares an inlay for reads. */
export interface FindUnmatchedBindingsInput {
  readonly bindings: ReadonlyArray<InlayBinding>;
  /** Every target's render column, keyed by target and then by artifact. */
  readonly renders: ReadonlyMap<TargetId, ReadonlyMap<ArtifactId, ArtifactRender>>;
  /** The artifacts the closure reached, the only ones whose declarations a binding can match. */
  readonly reached: ReadonlySet<ArtifactId>;
}

/**
 * Finds every binding naming an inlay no artifact declares, in the order the bindings run.
 *
 * Reported once against the config rather than once per target, because it is the config's fault alone: the name is a
 * string an author wrote, and repeating one typo across every target would bury the faults that are a target's. The
 * union of the sites is read across every target for the same reason, an inlay recognized under one target's stage
 * being an inlay some artifact declares.
 *
 * An inlay nothing binds is no fault and is not reported here: a body offers a place for content, and a config is free
 * not to put any there. This is the other direction -- a config asking for a fill with nowhere to put it.
 */
export function findUnmatchedBindings(input: FindUnmatchedBindingsInput): Array<BindingDiagnostic> {
  const declared = new Set<string>();
  for (const column of input.renders.values()) {
    for (const [artifactId, render] of column) {
      if (render.status !== 'rendered' || !input.reached.has(artifactId)) {
        continue;
      }
      for (const site of render.inlays) {
        declared.add(site.name);
      }
    }
  }

  return input.bindings
    .filter(({ inlayName }) => !declared.has(inlayName))
    .map(({ inlayName }) => ({
      code: 'unmatched-inlay' as const,
      message: `The binding to inlay "${inlayName}" names an inlay no artifact declares.`,
      at: { inlayName },
    }));
}
