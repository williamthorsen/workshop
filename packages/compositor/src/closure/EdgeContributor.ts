import type { DependencyEdge, PartialEntry } from '../schemas/graph-schemas.ts';
import type { ArtifactId, KindId } from '../schemas/scalar-schemas.ts';
import type { TransclusionSource } from '../transclusion/expandTransclusions.ts';

/**
 * One artifact as the contributor receives it, with the entry file already read.
 *
 * `source` is the shape an expansion resolves within, so a contributor reading tokens out of a transcluded body passes
 * it straight through rather than rebuilding it. `path` is posix-separated and relative to `source.dir`, which is the
 * form that expansion takes as its entry.
 */
export interface ArtifactRead {
  readonly artifactId: ArtifactId;
  readonly kindId: KindId;
  readonly slug: string;
  readonly source: TransclusionSource;
  readonly path: string;
  readonly content: string;
}

/** The edges one artifact's body contributes, and the partials those edges were read from. */
export interface EdgeContribution {
  readonly edges: ReadonlyArray<DependencyEdge>;
  readonly partials: ReadonlyArray<PartialEntry>;
}

/**
 * Contributes the edges an artifact's body declares, which no frontmatter key can state.
 *
 * The seam invocation tokens reach the closure through: a token contributes an edge, and the body it sits in may have
 * been assembled from partials, so both the edge and the partial it came from arrive here. It is a function rather than
 * data because a body's edges are found by expanding and matching it, not by looking a key up.
 *
 * Faults are the contributor's own to report to whoever configured it. What comes back is edges, so the closure's
 * diagnostic vocabulary stays the closure's.
 */
export type EdgeContributor = (read: ArtifactRead) => Promise<EdgeContribution> | EdgeContribution;
