import { compareStrings } from '../portable/compareStrings.ts';
import type { Closure, ClosureArtifact } from '../schemas/closure-schemas.ts';
import { CLOSURE_SCHEMA_VERSION } from '../schemas/closure-schemas.ts';
import type { TierDescriptor } from '../schemas/descriptor-schemas.ts';
import type { Seed } from '../schemas/graph-schemas.ts';
import type { ArtifactId, PartialId } from '../schemas/scalar-schemas.ts';
import type { EdgeGraph } from './EdgeGraph.ts';
import { walkEdges } from './walkEdges.ts';

/** A selection as the walk reads it: the artifacts something seeded, each with the tiers that decided it. */
export interface SeedView {
  readonly seeded: ReadonlyArray<{ artifactId: ArtifactId; seededBy: ReadonlyArray<Seed> }>;
}

/** What computing a closure takes. */
export interface ComputeClosureInput {
  readonly graph: EdgeGraph;
  readonly selection: SeedView;
  /** The tiers a seed may name, lowest precedence first, as a plan records them. */
  readonly tiers: ReadonlyArray<TierDescriptor>;
}

/**
 * Expands a selection into the closure its dependencies imply.
 *
 * Pure and free of I/O: the graph is the only view of the content, so recomputing over a changed config reads nothing,
 * which is what makes a toggle-and-recompute loop free. That is the whole reason the reading and the walking are two
 * steps rather than one.
 *
 * `selection` is the smallest shape the walk reads, so a full selection satisfies it as it stands and a caller holding
 * bare seeds needs to invent nothing around them. A seed naming an artifact the catalog does not contain fails the
 * call: a selection is derived from a catalog, so one that names something else was built by hand and built wrong.
 *
 * The document contains only what a reader of it needs, so a kind arrives without the on-disk layout resolution used
 * and a source without the directory it resolved to. Neither means anything to a reader of a closure, and a filesystem
 * path has no business travelling inside a payload.
 */
export function computeClosure(input: ComputeClosureInput): Closure {
  const { graph, selection, tiers } = input;
  const entries = new Map(graph.catalog.entries.map((entry) => [entry.id, entry]));
  const walk = walkEdges({ entries, edges: graph.edges, seeds: selection.seeded });

  const artifacts = walk.artifacts.toSorted((left, right) => compareStrings(left.id, right.id));
  const reached = new Set(artifacts.map(({ id }) => id));
  const named = collectNamedPartials(artifacts);

  return {
    schemaVersion: CLOSURE_SCHEMA_VERSION,
    kinds: graph.catalog.kinds.map(({ id, label, emitsFiles }) => ({ id, label, emitsFiles })),
    sources: graph.catalog.sources.map(({ id, name, origin }) => ({ id, name, origin })),
    tiers: tiers.map(({ id, label }) => ({ id, label })),
    artifacts,
    partials: graph.partials.filter((partial) => named.has(partial.id)),
    diagnostics: [...graph.diagnostics.filter(({ at }) => reached.has(at.artifactId)), ...walk.diagnostics],
  };
}

// region | Helpers

/** Collects the partials the surviving token edges name, the only ones a closure has to keep. */
function collectNamedPartials(artifacts: ReadonlyArray<ClosureArtifact>): ReadonlySet<PartialId> {
  const named = new Set<PartialId>();
  for (const artifact of artifacts) {
    for (const edge of artifact.dependsOn) {
      if (edge.partialId !== undefined) {
        named.add(edge.partialId);
      }
    }
  }
  return named;
}

// endregion | Helpers
