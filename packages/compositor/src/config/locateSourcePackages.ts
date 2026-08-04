import type { CompositorConfig } from '../schemas/config-schemas.ts';
import { composeLocationKey } from './composeLocationKey.ts';
import { locatePackage } from './locatePackage.ts';

/** What locating a config's declared packages needs beyond the config itself. */
export interface LocateSourcePackagesOptions {
  /**
   * The key path into a package's own `package.json` that names its content directory, such as
   * `['compositor', 'content']`.
   */
  readonly contentKeyPath: ReadonlyArray<string>;
}

/**
 * Where one declared package resolved, or why it did not.
 *
 * A failure travels as data rather than as a throw, because a walk that runs ahead of the fold cannot know which
 * packages the fold will adopt. Whether a failure matters is the fold's question, and raising it there is what keeps a
 * package a tier declares and a later tier drops from failing a config that works today.
 *
 * `baseDir` is the tier's as declared, not a canonical form: it identifies the record beside `package`, and the
 * comparison both sides make goes through `composeLocationKey`.
 */
export type PackageLocation =
  | { readonly outcome: 'located'; readonly package: string; readonly baseDir: string; readonly dir: string }
  | { readonly outcome: 'failed'; readonly package: string; readonly baseDir: string; readonly reason: string };

/**
 * Locates every package any tier of `config` declares, one walk per distinct package and base directory.
 *
 * This is the impure half of source resolution, and the only half that reads disk. It gathers rather than decides:
 * every declared package is walked, including one a later tier drops, so a fold over a modified config can re-adopt a
 * dropped source without touching disk again. Nothing here throws for a package that will not resolve.
 *
 * Base directory and package name are the whole of what resolution depends on, which is why they are what a record is
 * keyed by: a fold may rename sources, remap paths, and reorder tiers against one set of locations, and only naming a
 * package the walk never saw leaves it without an answer.
 */
export async function locateSourcePackages(
  config: CompositorConfig,
  options: LocateSourcePackagesOptions,
): Promise<ReadonlyArray<PackageLocation>> {
  const requested = new Map<string, { baseDir: string; package: string }>();

  for (const tier of config.tiers) {
    for (const source of tier.sources.use) {
      if (source.origin.kind === 'package') {
        requested.set(composeLocationKey(tier.baseDir, source.origin.location), {
          baseDir: tier.baseDir,
          package: source.origin.location,
        });
      }
    }
  }

  return Promise.all(requested.values().map((request) => locateOne(request, options)));
}

// region | Helpers

/** Locates one package, answering with the reason in place of the directory where the walk failed. */
async function locateOne(
  request: { readonly baseDir: string; readonly package: string },
  options: LocateSourcePackagesOptions,
): Promise<PackageLocation> {
  const { baseDir, package: name } = request;
  try {
    const dir = await locatePackage(name, { baseDir, contentKeyPath: options.contentKeyPath });
    return { outcome: 'located', package: name, baseDir, dir };
  } catch (error: unknown) {
    return {
      outcome: 'failed',
      package: name,
      baseDir,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

// endregion | Helpers
