import { compareStrings } from '../portable/compareStrings.ts';
import { composeArtifactId } from '../resolution/composeArtifactId.ts';
import type { Catalog } from '../schemas/catalog-schemas.ts';
import { CATALOG_SCHEMA_VERSION } from '../schemas/catalog-schemas.ts';

/** One artifact the catalog contains, and the sources with a copy of it, highest precedence first. */
export interface CatalogEntrySpec {
  readonly kindId: string;
  readonly slug: string;
  readonly carriedBy: ReadonlyArray<string>;
}

/** What a catalog should contain, stated as briefly as a selection test needs. */
export interface CatalogSpec {
  /** Defaults to the kinds the entries name. State it to declare a kind that has no entries. */
  readonly kinds?: ReadonlyArray<string>;
  /** The kinds that take part in the graph without producing output. Every other kind emits files. */
  readonly traversalOnlyKinds?: ReadonlyArray<string>;
  readonly sources: ReadonlyArray<string>;
  readonly entries: ReadonlyArray<CatalogEntrySpec>;
}

/**
 * Builds a catalog containing exactly what `spec` describes, with entries in the id order a real catalog runs in.
 *
 * Every source points at a directory that does not exist. Selection never reads one, so a test that accidentally grew a
 * filesystem dependency fails rather than passing against whatever happened to be on disk.
 */
export function buildCatalogFromSpec(spec: CatalogSpec): Catalog {
  const kindIds = spec.kinds ?? [...new Set(spec.entries.map(({ kindId }) => kindId))];
  const traversalOnly = new Set(spec.traversalOnlyKinds);

  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    kinds: kindIds.map((id) => ({
      id,
      label: id,
      emitsFiles: !traversalOnly.has(id),
      layout: { form: 'file' as const, root: id, extension: '.md' },
    })),
    sources: spec.sources.map((name) => ({
      id: name,
      name,
      origin: { kind: 'directory' as const, location: `./${name}` },
      dir: `/nonexistent/${name}`,
    })),
    entries: spec.entries
      .map(({ kindId, slug, carriedBy }) => {
        const [winner, ...shadowed] = carriedBy.map((sourceId) => ({
          sourceId,
          path: `${kindId}/${slug}.md`,
          hash: `hash:${sourceId}:${slug}`,
        }));
        if (winner === undefined) {
          throw new Error(`Entry "${kindId}:${slug}" names no source containing it.`);
        }
        return { id: composeArtifactId(kindId, slug), kindId, slug, resolution: { winner, shadowed } };
      })
      .toSorted((left, right) => compareStrings(left.id, right.id)),
  };
}
