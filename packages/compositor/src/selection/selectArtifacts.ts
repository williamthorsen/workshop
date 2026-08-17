import { compareStrings } from '../portable/compareStrings.ts';
import type { Catalog } from '../schemas/catalog-schemas.ts';
import type { CompositorConfig } from '../schemas/config-schemas.ts';
import type { Seed, SeedOrigin } from '../schemas/graph-schemas.ts';
import type { ArtifactId, Id } from '../schemas/scalar-schemas.ts';
import type { KindSelection, Selector } from '../schemas/selection-schemas.ts';
import type { CatalogIndex } from './buildCatalogIndex.ts';
import { buildCatalogIndex } from './buildCatalogIndex.ts';
import { expandSelector } from './expandSelector.ts';
import type { ConfigEntryRef, SelectionDiagnostic } from './SelectionDiagnostic.ts';

/** One artifact a tier dropped and no higher tier re-adopted. */
export interface DeclinedArtifact {
  readonly artifactId: ArtifactId;
  readonly via: SeedOrigin;
  readonly tierId: Id;
}

/** One inlay's fillers, in the order a plan splices them. */
export interface InlayBinding {
  readonly inlayName: string;
  readonly artifactIds: ReadonlyArray<ArtifactId>;
}

/** One artifact a config selected, with the tiers whose seeds survived the fold. */
export interface SeededArtifact {
  readonly artifactId: ArtifactId;
  readonly seededBy: ReadonlyArray<Seed>;
}

/**
 * What a tiered config selects from a catalog.
 *
 * `seeded` and `declined` run in artifact-id order, `bindings` in inlay-name order, and `diagnostics` in config order,
 * so two selections of the same shape diff cleanly. Each artifact's `seededBy` runs in tier order instead, matching
 * the order a plan carries it in, and each binding's `artifactIds` in the order a fill splices them.
 */
export interface Selection {
  readonly seeded: ReadonlyArray<SeededArtifact>;
  readonly declined: ReadonlyArray<DeclinedArtifact>;
  readonly bindings: ReadonlyArray<InlayBinding>;
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
 * A binding seeds like any other selector rather than standing on an axis of its own, so a `select` drop unbinds and a
 * later `select` re-adoption does not restore the binding. A tier's bindings apply after its own `select`, so a tier
 * that both drops and binds one artifact ends bound. An inlay's `drop` unbinds from that inlay alone, leaving the
 * artifact wherever else it is bound and whatever else selected it.
 *
 * A selector matching nothing is a diagnostic rather than a failure, so validation reports every mistake in a config at
 * once.
 */
export function selectArtifacts(config: CompositorConfig, catalog: Catalog): Selection {
  const fold: Fold = {
    index: buildCatalogIndex(catalog),
    seeds: new Map(),
    declines: new Map(),
    bindings: new Map(),
    diagnostics: [],
  };

  for (const tier of config.tiers) {
    if (tier.shouldReset) {
      fold.seeds.clear();
      fold.declines.clear();
      fold.bindings.clear();
    }

    for (const block of tier.select) {
      applyBlock(fold, tier.id, block, undefined);
    }
    // Inlay names are walked in order, so a config authored in two key orders reports its faults in one order.
    for (const [inlayName, blocks] of Object.entries(tier.inlays).toSorted(([left], [right]) =>
      compareStrings(left, right),
    )) {
      for (const block of blocks) {
        applyBlock(fold, tier.id, block, inlayName);
      }
    }
  }

  const bindings = reconcileBindings(fold);

  return {
    seeded: [...fold.seeds]
      .map(([artifactId, seededBy]) => ({ artifactId, seededBy }))
      .toSorted((left, right) => compareStrings(left.artifactId, right.artifactId)),
    declined: fold.declines
      .values()
      .toArray()
      .toSorted((left, right) => compareStrings(left.artifactId, right.artifactId)),
    bindings,
    diagnostics: fold.diagnostics,
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

/**
 * Applies one kind block's selectors, under `select` where `inlayName` is absent and under that binding where it is.
 *
 * The two blocks share a selector grammar, so they share `expandSelector` and every diagnostic a selector can earn.
 * What differs is what a decision means: a `select` use seeds by how the selector named its artifact, while a binding
 * seeds `binding` whichever way it named it, the artifact being there to fill an inlay either way. A `select` drop
 * clears the artifact's seeds and declines it, while a binding's drop unbinds it from that one inlay and leaves the
 * rest of the fold alone.
 */
function applyBlock(fold: Fold, tierId: Id, block: KindSelection, inlayName: string | undefined): void {
  if (!fold.index.kindIds.has(block.kindId)) {
    fold.diagnostics.push({
      code: 'unknown-kind',
      message: `Kind "${block.kindId}" is not one the catalog carries.`,
      at: { tierId, kindId: block.kindId, ...(inlayName !== undefined && { inlayName }) },
    });
    return;
  }

  for (const [list, selectors] of [
    ['use', block.use],
    ['drop', block.drop],
  ] as const) {
    for (const [entryIndex, selector] of selectors.entries()) {
      const at: ConfigEntryRef = {
        tierId,
        kindId: block.kindId,
        ...(inlayName !== undefined && { inlayName }),
        list,
        index: entryIndex,
      };
      const matched = expandSelector(selector, block.kindId, fold.index, at, fold.diagnostics);

      for (const artifactId of matched) {
        if (inlayName !== undefined) {
          applyToBinding(fold, tierId, inlayName, list, artifactId);
        } else if (list === 'use') {
          addSeed(fold.seeds, artifactId, { via: readOrigin(selector), tierId });
          fold.declines.delete(artifactId);
        } else {
          fold.seeds.delete(artifactId);
          fold.declines.set(artifactId, { artifactId, via: readOrigin(selector), tierId });
        }
      }
    }
  }
}

/**
 * Binds or unbinds one artifact against one inlay.
 *
 * A repeat `use` records the tier's seed and leaves the position alone: the first binding fixes where an artifact
 * splices, and a higher tier restating it says who wants it there rather than where it goes.
 */
function applyToBinding(fold: Fold, tierId: Id, inlayName: string, list: 'use' | 'drop', artifactId: ArtifactId): void {
  const bound = fold.bindings.get(inlayName) ?? [];

  if (list === 'drop') {
    fold.bindings.set(
      inlayName,
      bound.filter((held) => held !== artifactId),
    );
    return;
  }

  addSeed(fold.seeds, artifactId, { via: 'binding', tierId });
  fold.declines.delete(artifactId);
  if (!bound.includes(artifactId)) {
    bound.push(artifactId);
  }
  fold.bindings.set(inlayName, bound);
}

/** The fold's mutable state, threaded through the blocks a tier declares. */
interface Fold {
  readonly index: CatalogIndex;
  readonly seeds: Map<ArtifactId, Array<Seed>>;
  readonly declines: Map<ArtifactId, DeclinedArtifact>;
  /** Keyed by inlay name, each list in the order a fill splices it. */
  readonly bindings: Map<string, Array<ArtifactId>>;
  readonly diagnostics: Array<SelectionDiagnostic>;
}

/** Reports whether a binding is among the reasons `artifactId` is a root. */
function hasBindingSeed(fold: Fold, artifactId: ArtifactId): boolean {
  return (fold.seeds.get(artifactId) ?? []).some((seed) => seed.via === 'binding');
}

/** Reads how a selector named what it named, which is the origin a seed or a decline records. */
function readOrigin(selector: Selector): SeedOrigin {
  return 'artifact' in selector ? 'declaration' : 'source-catalog';
}

/**
 * Settles the bindings and the seeds that justify them against each other, in inlay-name order.
 *
 * The two can disagree in either direction once the fold is done, and each direction is one of the rules being kept. A
 * `select` drop clears an artifact's seeds without knowing what bound it, so a binding whose seed did not survive is
 * dropped here. An inlay's `drop` unbinds without knowing what else the artifact fills, so a `binding` seed no
 * surviving binding stands behind is cleared here, and an artifact left with no seed at all stops being a root.
 */
function reconcileBindings(fold: Fold): Array<InlayBinding> {
  const bindings = [...fold.bindings]
    .map(([inlayName, artifactIds]) => ({
      inlayName,
      artifactIds: artifactIds.filter((artifactId) => hasBindingSeed(fold, artifactId)),
    }))
    .filter(({ artifactIds }) => artifactIds.length > 0)
    .toSorted((left, right) => compareStrings(left.inlayName, right.inlayName));

  const stillBound = new Set(bindings.flatMap(({ artifactIds }) => artifactIds));
  for (const [artifactId, seeds] of fold.seeds) {
    if (stillBound.has(artifactId) || !hasBindingSeed(fold, artifactId)) {
      continue;
    }
    const kept = seeds.filter((seed) => seed.via !== 'binding');
    if (kept.length === 0) {
      fold.seeds.delete(artifactId);
    } else {
      fold.seeds.set(artifactId, kept);
    }
  }

  return bindings;
}

// endregion | Helpers
