import { appendTo } from '../portable/appendTo.ts';
import type { Catalog } from '../schemas/catalog-schemas.ts';
import type { ArtifactId, Id, KindId } from '../schemas/scalar-schemas.ts';

/** The catalog as selection reads it: what exists, and which artifacts each source contains. */
export interface CatalogIndex {
  readonly kindIds: ReadonlySet<KindId>;
  readonly sourceIds: ReadonlySet<Id>;
  /** Keyed by kind, then slug. */
  readonly slugIndexesByKind: ReadonlyMap<KindId, ReadonlyMap<string, ArtifactId>>;
  /** Keyed by kind, then source, in catalog order. Indexes an artifact under every source that has a copy of it. */
  readonly sourceIndexesByKind: ReadonlyMap<KindId, ReadonlyMap<Id, ReadonlyArray<ArtifactId>>>;
}

/**
 * Indexes the catalog for lookup by slug and by source.
 *
 * The by-source index holds an artifact under every source that has a copy, shadowed as well as winning. Shadowing
 * decides which copy an artifact resolves from; selection decides which artifacts are in play, and a source a consumer
 * took whole contains the artifact whether or not it won it.
 */
export function buildCatalogIndex(catalog: Catalog): CatalogIndex {
  const slugIndexesByKind = new Map<KindId, Map<string, ArtifactId>>();
  const sourceIndexesByKind = new Map<KindId, Map<Id, Array<ArtifactId>>>();

  for (const entry of catalog.entries) {
    const artifactIdsBySlug = slugIndexesByKind.get(entry.kindId) ?? new Map<string, ArtifactId>();
    artifactIdsBySlug.set(entry.slug, entry.id);
    slugIndexesByKind.set(entry.kindId, artifactIdsBySlug);

    const artifactIdsBySource = sourceIndexesByKind.get(entry.kindId) ?? new Map<Id, Array<ArtifactId>>();
    for (const candidate of [entry.resolution.winner, ...entry.resolution.shadowed]) {
      appendTo(artifactIdsBySource, candidate.sourceId, entry.id);
    }
    sourceIndexesByKind.set(entry.kindId, artifactIdsBySource);
  }

  return {
    kindIds: new Set(catalog.kinds.map(({ id }) => id)),
    sourceIds: new Set(catalog.sources.map(({ id }) => id)),
    slugIndexesByKind,
    sourceIndexesByKind,
  };
}
