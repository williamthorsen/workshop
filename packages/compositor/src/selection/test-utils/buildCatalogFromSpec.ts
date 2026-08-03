import { compareStrings } from '../../portable/compareStrings.ts';
import { composeArtifactId } from '../../resolution/composeArtifactId.ts';
import type { Catalog } from '../../schemas/catalog-schemas.ts';
import { CATALOG_SCHEMA_VERSION } from '../../schemas/catalog-schemas.ts';

/** One artifact the catalog carries, and the sources carrying a copy of it, highest precedence first. */
export interface CatalogEntrySpec {
  readonly kindId: string;
  readonly slug: string;
  readonly carriedBy: ReadonlyArray<string>;
}

/** What a catalog should carry, stated as briefly as a selection test needs. */
export interface CatalogSpec {
  /** Defaults to the kinds the entries name. State it to declare a kind that carries no entries. */
  readonly kinds?: ReadonlyArray<string>;
  readonly sources: ReadonlyArray<string>;
  readonly entries: ReadonlyArray<CatalogEntrySpec>;
}

/**
 * Builds a catalog carrying exactly what `spec` describes, with entries in the id order a real catalog runs in.
 *
 * Every source points at a directory that does not exist. Selection never reads one, so a test that accidentally grew a
 * filesystem dependency fails rather than passing against whatever happened to be on disk.
 */
export function buildCatalogFromSpec(spec: CatalogSpec): Catalog {
  const kindIds = spec.kinds ?? [...new Set(spec.entries.map(({ kindId }) => kindId))];

  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    kinds: kindIds.map((id) => ({
      id,
      label: id,
      emitsFiles: true,
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
          throw new Error(`Entry "${kindId}:${slug}" names no source carrying it.`);
        }
        return { id: composeArtifactId(kindId, slug), kindId, slug, resolution: { winner, shadowed } };
      })
      .toSorted((left, right) => compareStrings(left.id, right.id)),
  };
}
