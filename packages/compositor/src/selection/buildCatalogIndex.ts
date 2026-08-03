import { appendTo } from '../portable/appendTo.ts';
import type { Catalog } from '../schemas/catalog-schemas.ts';
import type { ArtifactId, Id, KindId } from '../schemas/scalar-schemas.ts';

/** The catalog as selection reads it: what exists, and which artifacts each source carries. */
export interface CatalogIndex {
  readonly kindIds: ReadonlySet<KindId>;
  readonly sourceIds: ReadonlySet<Id>;
  /** Keyed by kind, then slug. */
  readonly bySlug: ReadonlyMap<KindId, ReadonlyMap<string, ArtifactId>>;
  /** Keyed by kind, then source, in catalog order. Carries an artifact under every source that has a copy of it. */
  readonly bySource: ReadonlyMap<KindId, ReadonlyMap<Id, ReadonlyArray<ArtifactId>>>;
}

/**
 * Indexes the catalog for lookup by slug and by source.
 *
 * The by-source index carries an artifact under every source that has a copy, shadowed as well as winning. Shadowing
 * decides which copy an artifact resolves from; selection decides which artifacts are in play, and a source a consumer
 * took whole carries the artifact whether or not it won it.
 */
export function buildCatalogIndex(catalog: Catalog): CatalogIndex {
  const bySlug = new Map<KindId, Map<string, ArtifactId>>();
  const bySource = new Map<KindId, Map<Id, Array<ArtifactId>>>();

  for (const entry of catalog.entries) {
    const slugs = bySlug.get(entry.kindId) ?? new Map<string, ArtifactId>();
    slugs.set(entry.slug, entry.id);
    bySlug.set(entry.kindId, slugs);

    const sources = bySource.get(entry.kindId) ?? new Map<Id, Array<ArtifactId>>();
    for (const candidate of [entry.resolution.winner, ...entry.resolution.shadowed]) {
      appendTo(sources, candidate.sourceId, entry.id);
    }
    bySource.set(entry.kindId, sources);
  }

  return {
    kindIds: new Set(catalog.kinds.map(({ id }) => id)),
    sourceIds: new Set(catalog.sources.map(({ id }) => id)),
    bySlug,
    bySource,
  };
}
