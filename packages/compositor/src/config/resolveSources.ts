import { compareStrings } from '../portable/compareStrings.ts';
import { expandPath } from '../portable/expandPath.ts';
import type { SourceSpec } from '../schemas/catalog-schemas.ts';
import type { CompositorConfig } from '../schemas/config-schemas.ts';
import type { SourceOrigin } from '../schemas/descriptor-schemas.ts';
import { locatePackage } from './locatePackage.ts';

/** What resolving a config's sources needs beyond the config itself. */
export interface ResolveSourcesOptions {
  /**
   * The key path into a package's own `package.json` that names its content directory, such as
   * `['compositor', 'content']`.
   */
  readonly contentKeyPath: ReadonlyArray<string>;
}

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

/**
 * Resolves the sources `config` declares, locating each on disk, in precedence order.
 *
 * The fold runs lowest tier first, keyed by name: a `use` adds the source or remaps an inherited one, a `drop` removes
 * it and records the decline, and a tier declaring `reset` discards every lower tier's contributions before it applies.
 * Precedence then runs higher tier first, and author order within a tier, so a config reads with precedence descending
 * down the page and a consumer's own content outranks a package it listed below.
 *
 * A package name is located here; a path is resolved against the tier that declared it. The location a consumer wrote
 * stays on the origin either way, so a plan reports the declaration rather than where it landed. Whether a resolved
 * directory exists is `assertSourceIsReadable`'s question.
 */
export async function resolveSources(
  config: CompositorConfig,
  options: ResolveSourcesOptions,
): Promise<SourceResolution> {
  const adopted = new Map<string, FoldedSource>();
  const declined = new Set<string>();

  for (const [tierIndex, tier] of config.tiers.entries()) {
    if (tier.reset) {
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

  const ordered = [...adopted].toSorted(([, left], [, right]) => comparePrecedence(left, right));
  const sources = await Promise.all(ordered.map(([name, folded]) => buildSpec(name, folded, options)));

  return { sources, declined: [...declined].toSorted(compareStrings) };
}

// region | Helpers

/** One source as the fold holds it: where it came from, and what decides its precedence. */
interface FoldedSource {
  readonly origin: SourceOrigin;
  readonly baseDir: string;
  readonly label: string;
  readonly tierIndex: number;
  readonly order: number;
}

/** Locates one source on disk, naming the tier it came from on any failure. */
async function buildSpec(name: string, folded: FoldedSource, options: ResolveSourcesOptions): Promise<SourceSpec> {
  const { origin, baseDir, label } = folded;
  try {
    const dir =
      origin.kind === 'package'
        ? await locatePackage(origin.location, { baseDir, contentKeyPath: options.contentKeyPath })
        : expandPath(origin.location, baseDir);
    return { id: name, name, origin, dir };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Source "${name}", declared by tier "${label}": ${message}`, { cause: error });
  }
}

/** Orders two sources higher tier first, then by author order, which is precedence descending. */
function comparePrecedence(left: FoldedSource, right: FoldedSource): number {
  return left.tierIndex === right.tierIndex ? left.order - right.order : right.tierIndex - left.tierIndex;
}

// endregion | Helpers
