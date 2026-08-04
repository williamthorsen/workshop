import { compareStrings } from '../portable/compareStrings.ts';
import type { Catalog } from '../schemas/catalog-schemas.ts';
import type { CompositorConfig } from '../schemas/config-schemas.ts';
import type { Seed, SeedOrigin } from '../schemas/graph-schemas.ts';
import type { ArtifactId, Id } from '../schemas/scalar-schemas.ts';
import type { Selector } from '../schemas/selection-schemas.ts';
import { buildCatalogIndex } from './buildCatalogIndex.ts';
import { expandSelector } from './expandSelector.ts';
import type { ConfigEntryRef, SelectionDiagnostic } from './SelectionDiagnostic.ts';

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
 * Selects the artifacts `config` asks for from `catalog`, recording the tier that decided each.
 *
 * Pure and free of I/O: the catalog is the only view of the filesystem, so re-running this over a changed config reads
 * nothing, which is what makes a shadow evaluation of an edited config free.
 *
 * The fold runs lowest tier first. Within a tier every `use` applies before every `drop`, and a tier declaring
 * `shouldReset` discards every lower tier's decisions first. Seeds and declines stay disjoint per artifact: a `drop`
 * clears the seeds beneath it and records the decline, and a later `use` clears the decline and seeds afresh. What
 * survives to the end is therefore what decided the final state, which is what tells a project-level opt-in from an
 * inherited one.
 *
 * A selector matching nothing is a diagnostic rather than a failure, so validation reports every mistake in a config at
 * once.
 */
export function selectArtifacts(config: CompositorConfig, catalog: Catalog): Selection {
  const index = buildCatalogIndex(catalog);
  const seeds = new Map<ArtifactId, Array<Seed>>();
  const declines = new Map<ArtifactId, DeclinedArtifact>();
  const diagnostics: Array<SelectionDiagnostic> = [];

  for (const tier of config.tiers) {
    if (tier.shouldReset) {
      seeds.clear();
      declines.clear();
    }

    for (const block of tier.select) {
      if (!index.kindIds.has(block.kindId)) {
        diagnostics.push({
          code: 'unknown-kind',
          message: `Kind "${block.kindId}" is not one the catalog carries.`,
          at: { tierId: tier.id, kindId: block.kindId },
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

/** Records one seed against an artifact, unless that tier already seeded it the same way. */
function addSeed(seeds: Map<ArtifactId, Array<Seed>>, artifactId: ArtifactId, seed: Seed): void {
  const existing = seeds.get(artifactId) ?? [];
  if (existing.some((held) => held.via === seed.via && held.tierId === seed.tierId)) {
    return;
  }
  existing.push(seed);
  seeds.set(artifactId, existing);
}

/** Reads how a selector named what it named, which is the origin a seed or a decline records. */
function readOrigin(selector: Selector): SeedOrigin {
  return 'artifact' in selector ? 'declaration' : 'source-catalog';
}

// endregion | Helpers
