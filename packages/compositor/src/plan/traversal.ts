import type { ArtifactId } from '../schemas/common.ts';
import type { FileEntry } from '../schemas/file-schemas.ts';
import type { Plan } from '../schemas/plan-schema.ts';

/** Reverse lookups over a plan's graph, answering the "used by" direction the payload stores only forwards. */
export interface TraversalIndex {
  /** The artifacts whose edges point at `artifactId`. */
  findDependents(artifactId: ArtifactId): ReadonlyArray<ArtifactId>;

  /** The files `artifactId` contributes content to. */
  findContributedFiles(artifactId: ArtifactId): ReadonlyArray<FileEntry>;
}

/**
 * Builds the reverse index for one plan.
 *
 * The file-to-artifact edge is written only on the file, so the artifact-to-file direction exists nowhere in the
 * payload until it is derived here. Build once per plan: a provenance pane issues many lookups against one plan.
 */
export function buildTraversalIndex(plan: Plan): TraversalIndex {
  const dependents = new Map<ArtifactId, Array<ArtifactId>>();
  for (const artifact of plan.artifacts) {
    const edges = artifact.dependsOn ?? [];
    for (const edge of edges) {
      appendTo(dependents, edge.to, artifact.id);
    }
  }

  const contributedFiles = new Map<ArtifactId, Array<FileEntry>>();
  for (const file of plan.files) {
    for (const contribution of file.contributors.artifacts) {
      appendTo(contributedFiles, contribution.artifactId, file);
    }
  }

  return {
    findDependents: (artifactId) => dependents.get(artifactId) ?? [],
    findContributedFiles: (artifactId) => contributedFiles.get(artifactId) ?? [],
  };
}

/**
 * Every path from a seeded artifact to `artifactId`, following dependency edges.
 *
 * A diamond yields one path per route. Paths are derived on demand because enumerating them is exponential in a
 * diamond-heavy graph, and a plan recomputed on every toggle cannot afford to carry them; one lookup covers one
 * artifact, at the moment a reader asks why it is present.
 *
 * Each path runs seed-first and ends at `artifactId`, so a seeded artifact yields a single one-element path. Ordering
 * follows the plan's own table and edge order, which makes the result deterministic. A cycle terminates the walk that
 * reached it: a valid plan holds none, and a malformed one must not hang the caller.
 */
export function resolveInclusionPaths(plan: Plan, artifactId: ArtifactId): Array<Array<ArtifactId>> {
  const edges = buildForwardEdges(plan);
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

  for (const seed of findSeeds(plan)) {
    walk(seed);
  }
  return paths;
}

// region | Helpers

/** Appends `value` to the list `key` maps to, starting one when the key is new. */
function appendTo<K, V>(index: Map<K, Array<V>>, key: K, value: V): void {
  const existing = index.get(key);
  if (existing === undefined) {
    index.set(key, [value]);
  } else {
    existing.push(value);
  }
}

/** The outgoing edge targets of each artifact, in the order the plan records them. */
function buildForwardEdges(plan: Plan): ReadonlyMap<ArtifactId, ReadonlyArray<ArtifactId>> {
  const edges = new Map<ArtifactId, Array<ArtifactId>>();
  for (const artifact of plan.artifacts) {
    const outgoing = artifact.dependsOn ?? [];
    edges.set(
      artifact.id,
      outgoing.map((edge) => edge.to),
    );
  }
  return edges;
}

/** The artifacts a path can start from: those something seeded, in table order. */
function findSeeds(plan: Plan): ReadonlyArray<ArtifactId> {
  return plan.artifacts
    .filter((artifact) => artifact.status !== 'removed' && artifact.seededBy.length > 0)
    .map((artifact) => artifact.id);
}

// endregion | Helpers
