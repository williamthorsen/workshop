import { compareStrings } from '../../portable/compareStrings.ts';
import type { ArtifactResolution } from '../../schemas/artifact-resolution-schemas.ts';
import type { ClosureArtifact } from '../../schemas/closure-schemas.ts';
import type { ArtifactEntry, DependencyEdge, RemovedArtifact } from '../../schemas/graph-schemas.ts';
import type { ArtifactId, PartialId } from '../../schemas/scalar-schemas.ts';
import type { ClaimedArtifact } from '../../snapshot/readTargetState.ts';
import type { ContentVerdict } from './TargetPlanContext.ts';

/** What building a plan's artifact table reads. */
export interface ClassifyArtifactsInput {
  /** The artifacts the closure reached, in id order. */
  readonly artifacts: ReadonlyArray<ClosureArtifact>;
  /** One verdict per destination an artifact owns computed content at, keyed by artifact. */
  readonly verdicts: ReadonlyMap<ArtifactId, ReadonlyArray<ContentVerdict>>;
  /** The artifacts a destination still holds that the closure does not. */
  readonly departed: ReadonlyArray<ClaimedArtifact>;
  /** Each artifact's resolution, for the departing ones a source still carries. */
  readonly resolutions: ReadonlyMap<ArtifactId, ArtifactResolution>;
  readonly edges: ReadonlyMap<ArtifactId, ReadonlyArray<DependencyEdge>>;
  /** The partials the plan carries, which an edge recorded against a departing artifact may name. */
  readonly partialIds: ReadonlySet<PartialId>;
}

/**
 * Builds a plan's artifact table: everything the closure reached, with everything departing beside it, in id order.
 *
 * An artifact's status measures its own content rather than the files it lands in. Several artifacts can share one
 * aggregated file, and a roll-up over files would move every contributor whenever any one of them moved. An artifact
 * with no verdict at all -- a kind emitting no files, a kind no target deploys, an artifact blocked everywhere -- is
 * `unchanged`: nothing records where it previously stood, and no other answer is honest.
 */
export function classifyArtifacts(input: ClassifyArtifactsInput): Array<ArtifactEntry> {
  const carried = new Set([...input.artifacts.map(({ id }) => id), ...input.departed.map(({ id }) => id)]);

  const present: Array<ArtifactEntry> = input.artifacts.map((artifact) => ({
    ...artifact,
    status: foldVerdicts(input.verdicts.get(artifact.id)),
  }));
  const removed = input.departed.map((artifact) => describeRemoval(artifact, carried, input));

  return [...present, ...removed].toSorted((left, right) => compareStrings(left.id, right.id));
}

// region | Helpers

/**
 * Describes one departing artifact with whatever is still knowable about it.
 *
 * Its edges are filtered to what the plan carries, the rule `walkEdges` already holds a document to, so that every edge
 * in the table points at something the table resolves. Its resolution is absent once no source carries it, which is
 * exactly the artifact the shape-matched claim exists to reach.
 */
function describeRemoval(
  artifact: ClaimedArtifact,
  carried: ReadonlySet<ArtifactId>,
  input: ClassifyArtifactsInput,
): RemovedArtifact {
  const edges = (input.edges.get(artifact.id) ?? []).filter(
    (edge) => carried.has(edge.to) && (edge.partialId === undefined || input.partialIds.has(edge.partialId)),
  );
  const resolution = input.resolutions.get(artifact.id);

  return {
    id: artifact.id,
    kindId: artifact.kindId,
    slug: artifact.slug,
    status: 'removed',
    dependsOn: edges,
    ...(resolution !== undefined && { resolution }),
  };
}

/** Folds an artifact's verdicts into the status it carries: added throughout, unchanged throughout, or changed. */
function foldVerdicts(verdicts: ReadonlyArray<ContentVerdict> | undefined): ContentVerdict {
  if (verdicts === undefined || verdicts.length === 0) {
    return 'unchanged';
  }
  if (verdicts.every((verdict) => verdict === 'added')) {
    return 'added';
  }
  return verdicts.every((verdict) => verdict === 'unchanged') ? 'unchanged' : 'changed';
}

// endregion | Helpers
