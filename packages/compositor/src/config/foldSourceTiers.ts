import { compareStrings } from '../portable/compareStrings.ts';
import { expandPath } from '../portable/expandPath.ts';
import type { SourceSpec } from '../schemas/catalog-schemas.ts';
import type { CompositorConfig } from '../schemas/config-schemas.ts';
import type { SourceOrigin } from '../schemas/descriptor-schemas.ts';
import type { PackageLocation } from './locateSourcePackages.ts';
import { composeLocationKey } from './locateSourcePackages.ts';

/** The sources a config declares, and the names it turned down. */
export interface SourceResolution {
  /** Highest precedence first, which is the order resolution reads them in. */
  readonly sources: ReadonlyArray<SourceSpec>;
  /**
   * The names a tier dropped and no higher tier re-adopted, in name order.
   *
   * Keeping them distinguishes a source a consumer turned down from one it has never mentioned, which is what lets an
   * advisory scan stay quiet about the former.
   */
  readonly declined: ReadonlyArray<string>;
}

/** Raised when a config adopts a package the supplied locations never saw. */
export class StaleSnapshotError extends Error {
  override readonly name = 'StaleSnapshotError';

  /** The package name that went unanswered. */
  readonly package: string;
  /** The base directory it would have been located from. */
  readonly baseDir: string;

  constructor(details: { source: string; tier: string; package: string; baseDir: string }) {
    super(
      `Source "${details.source}", declared by tier "${details.tier}": package "${details.package}" has no location ` +
        'in the locations supplied. Locate the packages again, which a config naming one it did not name before needs.',
    );
    this.package = details.package;
    this.baseDir = details.baseDir;
  }
}

/**
 * Folds `config`'s tiers into the sources resolution reads, in precedence order, over packages already located.
 *
 * The fold runs lowest tier first, keyed by name: a `use` adds the source or remaps an inherited one, a `drop` removes
 * it and records the decline, and a tier declaring `shouldReset` discards every lower tier's contributions before it
 * applies. Precedence then runs higher tier first, and author order within a tier, so a config reads with precedence
 * descending down the page and a consumer's own content outranks a package it listed below.
 *
 * Pure and synchronous, reading `locations` for what it cannot compute: a package's directory is the one thing source
 * resolution needs disk for, and a path resolves against the tier that declared it by arithmetic alone. That is what
 * lets an edited config be re-folded against one set of locations as fast as a caller can hand it over, which is the
 * whole point of separating this from the walk. The location a consumer wrote stays on the origin either way, so a plan
 * reports the declaration rather than where it landed. Whether a resolved directory exists is
 * `assertSourceIsReadable`'s question.
 *
 * A package the fold adopts fails one of two ways, and the two mean different things: a location recording a failed
 * walk raises that walk's reason, the fault a consumer's declaration or workspace carries; no location at all raises
 * `StaleSnapshotError`, which only a config naming a package the walk never saw can produce.
 */
export function foldSourceTiers(config: CompositorConfig, locations: ReadonlyArray<PackageLocation>): SourceResolution {
  const adopted = new Map<string, FoldedSource>();
  const declined = new Set<string>();

  for (const [tierIndex, tier] of config.tiers.entries()) {
    if (tier.shouldReset) {
      adopted.clear();
      declined.clear();
    }
    for (const [order, source] of tier.sources.use.entries()) {
      adopted.set(source.name, { origin: source.origin, baseDir: tier.baseDir, label: tier.label, tierIndex, order });
      declined.delete(source.name);
    }
    for (const name of tier.sources.drop) {
      adopted.delete(name);
      declined.add(name);
    }
  }

  const located = new Map(
    locations.map((location) => [composeLocationKey(location.baseDir, location.package), location]),
  );
  const ordered = [...adopted].toSorted(([, left], [, right]) => comparePrecedence(left, right));
  const sources = ordered.map(([name, folded]) => buildSpec(name, folded, located));

  return { sources, declined: [...declined].toSorted(compareStrings) };
}

// region | Helpers

/** Builds one source's spec, naming the tier it came from on any failure. */
function buildSpec(name: string, folded: FoldedSource, located: ReadonlyMap<string, PackageLocation>): SourceSpec {
  const { origin, baseDir, label } = folded;

  if (origin.kind !== 'package') {
    return { id: name, name, origin, dir: expandPath(origin.location, baseDir) };
  }

  const location = located.get(composeLocationKey(baseDir, origin.location));
  if (location === undefined) {
    throw new StaleSnapshotError({ source: name, tier: label, package: origin.location, baseDir });
  }
  if (location.outcome === 'failed') {
    throw new Error(`Source "${name}", declared by tier "${label}": ${location.reason}`);
  }
  return { id: name, name, origin, dir: location.dir };
}

/** Orders two sources higher tier first, then by author order, which is precedence descending. */
function comparePrecedence(left: FoldedSource, right: FoldedSource): number {
  return left.tierIndex === right.tierIndex ? left.order - right.order : right.tierIndex - left.tierIndex;
}

/** One source as the fold holds it: where it came from, and what decides its precedence. */
interface FoldedSource {
  readonly origin: SourceOrigin;
  readonly baseDir: string;
  readonly label: string;
  readonly tierIndex: number;
  readonly order: number;
}

// endregion | Helpers
