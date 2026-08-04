import type { CatalogEntry } from '../schemas/catalog-schemas.ts';
import type { ArtifactId, KindId } from '../schemas/scalar-schemas.ts';
import type { CatalogIndex } from '../selection/buildCatalogIndex.ts';

/**
 * Expands one artifact's wildcard to the artifacts its own source carries.
 *
 * The source is the one the declaring artifact resolved from, so an aggregate shipped by a source takes in that
 * source's own contents rather than some other source's. It reads what that source carries whether or not a
 * higher-precedence source shadows a copy: shadowing settles which copy an artifact resolves from, and this settles
 * which artifacts are named, the same distinction selection draws for a source taken whole.
 *
 * Only kinds that emit files are enumerated, which is what keeps an aggregate from naming other aggregates: a
 * traversal-only kind exists to be walked through, and "everything, including every aggregate of everything" is a
 * question no consumer means to ask. The declaring artifact is excluded whatever its kind, an artifact that names
 * itself otherwise closing a cycle the moment it is expanded.
 *
 * Results run in kind order, then in catalog order within a kind, which makes them deterministic.
 */
export function expandWildcard(
  entry: CatalogEntry,
  index: CatalogIndex,
  emittingKindIds: ReadonlyArray<KindId>,
): ReadonlyArray<ArtifactId> {
  const { sourceId } = entry.resolution.winner;
  return emittingKindIds
    .flatMap((kindId) => index.bySource.get(kindId)?.get(sourceId) ?? [])
    .filter((artifactId) => artifactId !== entry.id);
}
