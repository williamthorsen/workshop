import { composeArtifactId } from './composeArtifactId.ts';
import { assertSourceIsReadable, enumerateSource, type SourceArtifact } from './enumerateSource.ts';
import type { ResolutionCandidate } from './schemas/graphSchemas.ts';
import type { Catalog, CatalogEntry, ResolveKind, SourceSpec } from './schemas/resolutionSchemas.ts';
import { CATALOG_SCHEMA_VERSION } from './schemas/resolutionSchemas.ts';

/** What resolution reads: the kinds in play, and the sources to search in precedence order. */
export interface ResolveCatalogInput {
  readonly kinds: ReadonlyArray<ResolveKind>;
  /** Highest precedence first. The order is the whole of what makes one source shadow another. */
  readonly sources: ReadonlyArray<SourceSpec>;
}

/**
 * Every artifact the sources carry, each resolved to the source that won it and the sources that lost.
 *
 * Precedence is `sources` order and nothing else: the first source carrying an artifact wins it, and a consumer's
 * bundled library shadows nothing by declaring itself last. Resolution reads no config and computes no closure, so what
 * comes back is what exists rather than what anyone selected.
 *
 * Every source is checked before any is read, so a mistyped source fails the call rather than half-populating a catalog
 * and letting the artifacts it should have carried resolve from somewhere else.
 *
 * The result satisfies `assertCatalogIsConsistent` by construction, which is why this does not call it: a replan would
 * pay for the checks on every pass, and the assertion is for a catalog that arrived as data.
 */
export async function resolveCatalog(input: ResolveCatalogInput): Promise<Catalog> {
  const { kinds, sources } = input;
  await Promise.all(sources.map((source) => assertSourceIsReadable(source)));

  // Sources are read concurrently; precedence is imposed by the merge below, so the order they finish in cannot reach
  // the result.
  const perSource = await Promise.all(sources.map((source) => enumerateSource(source, kinds)));

  const candidates = new Map<string, Array<ResolutionCandidate>>();
  const identities = new Map<string, SourceArtifact>();
  for (const [index, artifacts] of perSource.entries()) {
    const source = sources[index];
    if (source === undefined) {
      continue;
    }
    for (const artifact of artifacts) {
      const id = composeArtifactId(artifact.kindId, artifact.slug);
      const forId = candidates.get(id) ?? [];
      forId.push({ sourceId: source.id, path: artifact.path, hash: artifact.hash });
      candidates.set(id, forId);
      identities.set(id, artifact);
    }
  }

  const entries = [...candidates]
    .map(([id, forId]) => buildEntry(id, forId, identities))
    .filter((entry): entry is CatalogEntry => entry !== undefined)
    .toSorted((left, right) => compareStrings(left.id, right.id));

  return { schemaVersion: CATALOG_SCHEMA_VERSION, kinds: [...kinds], sources: [...sources], entries };
}

// region | Helpers

/**
 * One entry from the candidates carrying its artifact, the first being the winner.
 *
 * The candidates arrive in source order because the merge walks the sources in precedence order, so the winner needs no
 * comparison: it is the one that got there first.
 */
function buildEntry(
  id: string,
  candidates: ReadonlyArray<ResolutionCandidate>,
  identities: ReadonlyMap<string, SourceArtifact>,
): CatalogEntry | undefined {
  const [winner, ...shadowed] = candidates;
  const identity = identities.get(id);
  if (winner === undefined || identity === undefined) {
    return undefined;
  }
  return { id, kindId: identity.kindId, slug: identity.slug, resolution: { winner, shadowed } };
}

/** Orders two strings by code point, which is what a consumer diffing two catalogs reproduces. */
function compareStrings(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

// endregion | Helpers
