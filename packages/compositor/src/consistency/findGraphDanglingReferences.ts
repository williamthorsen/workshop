import type { TraversableArtifact } from '../graph/traversal.ts';
import type { ArtifactResolution } from '../schemas/artifact-resolution-schemas.ts';
import type { Id } from '../schemas/scalar-schemas.ts';
import { collectIds } from './collectIds.ts';
import { createRequireKnown } from './createRequireKnown.ts';
import type { Violation } from './Violation.ts';

/**
 * One artifact as a cross-reference check reads it: the traversal shape, plus the two tables only this check follows.
 *
 * `resolution` is optional because a plan's removed artifact loses it when the source carrying it is dropped; a closure
 * artifact always has one.
 */
export interface ReferencingArtifact extends TraversableArtifact {
  readonly kindId: Id;
  readonly resolution?: ArtifactResolution | undefined;
}

/** Any document carrying an artifact graph, with the tables its entries point at. */
export interface ArtifactGraphView {
  readonly artifacts: ReadonlyArray<ReferencingArtifact>;
  readonly kinds: ReadonlyArray<{ id: Id }>;
  readonly partials: ReadonlyArray<{ id: Id; sourceId: Id }>;
  readonly sources: ReadonlyArray<{ id: Id }>;
  readonly tiers: ReadonlyArray<{ id: Id }>;
}

/**
 * Reports each reference out of the artifact and partial tables that names no entry in the table it points at.
 *
 * Shared by the plan and closure assertions, which carry the same graph and differ only in what surrounds it: a plan
 * adds its fingerprint, target, and file references on top, and a closure has none of those to add. Violations follow
 * the artifact table and then the partial table, which is the order both documents report them in.
 */
export function findGraphDanglingReferences(view: ArtifactGraphView): Array<Violation> {
  const artifactIds = collectIds(view.artifacts);
  const kindIds = collectIds(view.kinds);
  const partialIds = collectIds(view.partials);
  const sourceIds = collectIds(view.sources);
  const tierIds = collectIds(view.tiers);

  const violations: Array<Violation> = [];
  const requireKnown = createRequireKnown(violations);

  for (const [index, artifact] of view.artifacts.entries()) {
    const at = `artifacts[${index}]`;
    requireKnown(kindIds, artifact.kindId, `${at}.kindId`, 'kinds');
    const edges = artifact.dependsOn ?? [];
    for (const [edgeIndex, edge] of edges.entries()) {
      requireKnown(artifactIds, edge.to, `${at}.dependsOn[${edgeIndex}].to`, 'artifacts');
      requireKnown(partialIds, edge.partialId, `${at}.dependsOn[${edgeIndex}].partialId`, 'partials');
    }
    // A removed artifact carries no seeds at all, so the status narrowing is what reaches the field.
    const seeds = artifact.status === 'removed' ? [] : (artifact.seededBy ?? []);
    for (const [seedIndex, seed] of seeds.entries()) {
      requireKnown(tierIds, seed.tierId, `${at}.seededBy[${seedIndex}].tierId`, 'tiers');
    }
    if (artifact.resolution !== undefined) {
      requireKnown(sourceIds, artifact.resolution.winner.sourceId, `${at}.resolution.winner.sourceId`, 'sources');
      for (const [loserIndex, loser] of artifact.resolution.shadowed.entries()) {
        requireKnown(sourceIds, loser.sourceId, `${at}.resolution.shadowed[${loserIndex}].sourceId`, 'sources');
      }
    }
  }

  for (const [index, partial] of view.partials.entries()) {
    requireKnown(sourceIds, partial.sourceId, `partials[${index}].sourceId`, 'sources');
  }

  return violations;
}
