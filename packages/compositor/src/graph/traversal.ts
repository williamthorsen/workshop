import { appendTo } from '../portable/appendTo.ts';
import type { ArtifactId, DiffStatus } from '../schemas/common.ts';
import type { DependencyEdge, Seed } from '../schemas/graph-schemas.ts';

/**
 * One artifact as traversal reads it: an identity, the edges leaving it, and what seeded it.
 *
 * Every field but the id is optional, because a removed artifact carries no seeds and, once the source carrying it is
 * gone, no edges either. A plan's entry and a closure's both satisfy this shape without an adapter, which is what keeps
 * one implementation serving both documents.
 */
export interface TraversableArtifact {
  readonly id: ArtifactId;
  readonly dependsOn?: ReadonlyArray<DependencyEdge> | undefined;
  readonly seededBy?: ReadonlyArray<Seed> | undefined;
  readonly status?: DiffStatus | undefined;
}

/** Any document carrying a dependency graph: a plan, or the closure a plan is computed from. */
export interface DependencyGraphView {
  readonly artifacts: ReadonlyArray<TraversableArtifact>;
}

/** The artifacts whose edges point at `artifactId`, in the order the document records them. */
export type DependentsIndex = (artifactId: ArtifactId) => ReadonlyArray<ArtifactId>;

/**
 * Builds the reverse index for one document, answering the "used by" direction the payload stores only forwards.
 *
 * Build once per document: a provenance pane issues many lookups against one of them.
 */
export function buildDependentsIndex(view: DependencyGraphView): DependentsIndex {
  const dependents = new Map<ArtifactId, Array<ArtifactId>>();
  for (const artifact of view.artifacts) {
    const edges = artifact.dependsOn ?? [];
    for (const edge of edges) {
      appendTo(dependents, edge.to, artifact.id);
    }
  }
  return (artifactId) => dependents.get(artifactId) ?? [];
}

/**
 * Every path from a seeded artifact to `artifactId`, following dependency edges.
 *
 * A diamond yields one path per route. Paths are derived on demand because enumerating them is exponential in a
 * diamond-heavy graph, and a document recomputed on every toggle cannot afford to carry them; one lookup covers one
 * artifact, at the moment a reader asks why it is present.
 *
 * Each path runs seed-first and ends at `artifactId`, so a seeded artifact yields a single one-element path. Ordering
 * follows the document's own table and edge order, which makes the result deterministic. A cycle terminates the walk
 * that reached it: a valid document holds none, and a malformed one must not hang the caller.
 */
export function resolveInclusionPaths(view: DependencyGraphView, artifactId: ArtifactId): Array<Array<ArtifactId>> {
  const edges = buildForwardEdges(view);
  const paths: Array<Array<ArtifactId>> = [];
  const trail: Array<ArtifactId> = [];
  const onTrail = new Set<ArtifactId>();

  function walk(from: ArtifactId): void {
    if (onTrail.has(from)) {
      return;
    }
    trail.push(from);
    onTrail.add(from);

    if (from === artifactId) {
      paths.push([...trail]);
    } else {
      const outgoing = edges.get(from) ?? [];
      for (const to of outgoing) {
        walk(to);
      }
    }

    trail.pop();
    onTrail.delete(from);
  }

  for (const seed of findSeeds(view)) {
    walk(seed);
  }
  return paths;
}

// region | Helpers

/** The outgoing edge targets of each artifact, in the order the document records them. */
function buildForwardEdges(view: DependencyGraphView): ReadonlyMap<ArtifactId, ReadonlyArray<ArtifactId>> {
  const edges = new Map<ArtifactId, Array<ArtifactId>>();
  for (const artifact of view.artifacts) {
    edges.set(
      artifact.id,
      (artifact.dependsOn ?? []).map((edge) => edge.to),
    );
  }
  return edges;
}

/** The artifacts a path can start from: those something seeded, in table order. */
function findSeeds(view: DependencyGraphView): ReadonlyArray<ArtifactId> {
  return view.artifacts
    .filter((artifact) => artifact.status !== 'removed' && (artifact.seededBy ?? []).length > 0)
    .map((artifact) => artifact.id);
}

// endregion | Helpers
