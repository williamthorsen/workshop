import { compareStrings } from '../portable/compareStrings.ts';
import type { ArtifactId, Id, KindId } from '../schemas/common.ts';
import type { CompositorConfig, Selector } from '../schemas/config-schemas.ts';
import type { Seed, SeedOrigin } from '../schemas/graph-schemas.ts';
import type { Catalog } from '../schemas/resolution-schemas.ts';

/** Where in a config something was declared, so a diagnostic reaches the entry an author wrote. */
export interface ConfigEntryRef {
  readonly tierId: Id;
  readonly kindId: KindId;
  readonly list: 'use' | 'drop';
  /** Absent when the whole block is at fault rather than one entry in it. */
  readonly index?: number;
}

/** One artifact a tier dropped and no higher tier re-adopted. */
export interface DeclinedArtifact {
  readonly artifactId: ArtifactId;
  readonly via: SeedOrigin;
  readonly tierId: Id;
}

/** One artifact a config selected, with the tiers whose seeds survived the fold. */
export interface SeededArtifact {
  readonly artifactId: ArtifactId;
  readonly seededBy: ReadonlyArray<Seed>;
}

/** One selector that named something the catalog does not carry. */
export interface SelectionDiagnostic {
  readonly code: 'unknown-artifact' | 'unknown-kind' | 'unknown-source' | 'empty-source';
  readonly message: string;
  readonly at: ConfigEntryRef;
}

/**
 * What a tiered config selects from a catalog.
 *
 * `seeded` and `declined` run in artifact-id order and `diagnostics` in config order, so two selections of the same
 * shape diff cleanly. Each artifact's `seededBy` runs in tier order instead, matching the order a plan carries it in.
 */
export interface Selection {
  readonly seeded: ReadonlyArray<SeededArtifact>;
  readonly declined: ReadonlyArray<DeclinedArtifact>;
  readonly diagnostics: ReadonlyArray<SelectionDiagnostic>;
}

/**
 * The artifacts `config` selects from `catalog`, each with the tier that decided it.
 *
 * Pure and free of I/O: the catalog is the only view of the filesystem, so re-running this over a changed config reads
 * nothing, which is what makes a shadow evaluation of an edited config free.
 *
 * The fold runs lowest tier first. Within a tier every `use` applies before every `drop`, and a tier declaring `reset`
 * discards every lower tier's decisions first. Seeds and declines stay disjoint per artifact: a `drop` clears the seeds
 * beneath it and records the decline, and a later `use` clears the decline and seeds afresh. What survives to the end is
 * therefore what decided the final state, which is what tells a project-level opt-in from an inherited one.
 *
 * A selector matching nothing is a diagnostic rather than a failure, so validation can report every mistake in a config
 * at once instead of stopping at the first.
 */
export function selectArtifacts(config: CompositorConfig, catalog: Catalog): Selection {
  const index = buildCatalogIndex(catalog);
  const seeds = new Map<ArtifactId, Array<Seed>>();
  const declines = new Map<ArtifactId, DeclinedArtifact>();
  const diagnostics: Array<SelectionDiagnostic> = [];

  for (const tier of config.tiers) {
    if (tier.reset) {
      seeds.clear();
      declines.clear();
    }

    for (const block of tier.select) {
      if (!index.kindIds.has(block.kindId)) {
        diagnostics.push({
          code: 'unknown-kind',
          message: `Kind "${block.kindId}" is not one the catalog carries.`,
          at: { tierId: tier.id, kindId: block.kindId, list: 'use' },
        });
        continue;
      }

      for (const [list, selectors] of [
        ['use', block.use],
        ['drop', block.drop],
      ] as const) {
        for (const [entryIndex, selector] of selectors.entries()) {
          const at: ConfigEntryRef = { tierId: tier.id, kindId: block.kindId, list, index: entryIndex };
          const matched = expandSelector(selector, block.kindId, index, at, diagnostics);
          for (const artifactId of matched) {
            if (list === 'use') {
              addSeed(seeds, artifactId, { via: readOrigin(selector), tierId: tier.id });
              declines.delete(artifactId);
            } else {
              seeds.delete(artifactId);
              declines.set(artifactId, { artifactId, via: readOrigin(selector), tierId: tier.id });
            }
          }
        }
      }
    }
  }

  return {
    seeded: [...seeds]
      .map(([artifactId, seededBy]) => ({ artifactId, seededBy }))
      .toSorted((left, right) => compareStrings(left.artifactId, right.artifactId)),
    declined: declines
      .values()
      .toArray()
      .toSorted((left, right) => compareStrings(left.artifactId, right.artifactId)),
    diagnostics,
  };
}

// region | Helpers

/** The catalog as selection reads it: what exists, and which artifacts each source carries. */
interface CatalogIndex {
  readonly kindIds: ReadonlySet<KindId>;
  readonly sourceIds: ReadonlySet<Id>;
  /** Keyed by kind, then slug. */
  readonly bySlug: ReadonlyMap<KindId, ReadonlyMap<string, ArtifactId>>;
  /** Keyed by kind, then source, in catalog order. Carries an artifact under every source that has a copy of it. */
  readonly bySource: ReadonlyMap<KindId, ReadonlyMap<Id, ReadonlyArray<ArtifactId>>>;
}

/** Records one seed against an artifact, unless that tier already seeded it the same way. */
function addSeed(seeds: Map<ArtifactId, Array<Seed>>, artifactId: ArtifactId, seed: Seed): void {
  const existing = seeds.get(artifactId) ?? [];
  if (existing.some((held) => held.via === seed.via && held.tierId === seed.tierId)) {
    return;
  }
  existing.push(seed);
  seeds.set(artifactId, existing);
}

/**
 * The catalog indexed for lookup by slug and by source.
 *
 * The by-source index carries an artifact under every source that has a copy, shadowed as well as winning. Shadowing
 * decides which copy an artifact resolves from; selection decides which artifacts are in play, and a source a consumer
 * took whole carries the artifact whether or not it won it.
 */
function buildCatalogIndex(catalog: Catalog): CatalogIndex {
  const bySlug = new Map<KindId, Map<string, ArtifactId>>();
  const bySource = new Map<KindId, Map<Id, Array<ArtifactId>>>();

  for (const entry of catalog.entries) {
    const slugs = bySlug.get(entry.kindId) ?? new Map<string, ArtifactId>();
    slugs.set(entry.slug, entry.id);
    bySlug.set(entry.kindId, slugs);

    const sources = bySource.get(entry.kindId) ?? new Map<Id, Array<ArtifactId>>();
    for (const candidate of [entry.resolution.winner, ...entry.resolution.shadowed]) {
      const carried = sources.get(candidate.sourceId) ?? [];
      carried.push(entry.id);
      sources.set(candidate.sourceId, carried);
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

/** The artifacts `selector` names, appending a diagnostic and matching nothing when it names something unknown. */
function expandSelector(
  selector: Selector,
  kindId: KindId,
  index: CatalogIndex,
  at: ConfigEntryRef,
  diagnostics: Array<SelectionDiagnostic>,
): ReadonlyArray<ArtifactId> {
  if ('artifact' in selector) {
    const artifactId = index.bySlug.get(kindId)?.get(selector.artifact);
    if (artifactId === undefined) {
      diagnostics.push({
        code: 'unknown-artifact',
        message: `No source carries "${selector.artifact}" of kind "${kindId}".`,
        at,
      });
      return [];
    }
    return [artifactId];
  }

  if (!index.sourceIds.has(selector.source)) {
    diagnostics.push({ code: 'unknown-source', message: `Source "${selector.source}" is not declared.`, at });
    return [];
  }

  const carried = index.bySource.get(kindId)?.get(selector.source) ?? [];
  if (carried.length === 0) {
    diagnostics.push({
      code: 'empty-source',
      message: `Source "${selector.source}" carries nothing of kind "${kindId}".`,
      at,
    });
  }
  return carried;
}

/** How a selector named what it named, which is the origin a seed or a decline records. */
function readOrigin(selector: Selector): SeedOrigin {
  return 'artifact' in selector ? 'declaration' : 'source-catalog';
}

// endregion | Helpers
