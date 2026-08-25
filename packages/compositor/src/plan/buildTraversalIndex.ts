import { buildDependentsIndex } from '../graph/traversal.ts';
import { appendTo } from '../portable/appendTo.ts';
import type { FileEntry } from '../schemas/file-schemas.ts';
import type { Plan } from '../schemas/plan-schemas.ts';
import type { ArtifactId } from '../schemas/scalar-schemas.ts';

/** Reverse lookups over a plan's graph, giving the two "used by" directions the payload stores only forwards. */
export interface TraversalIndex {
  /** Finds the artifacts whose edges point at `artifactId`. */
  findDependents(artifactId: ArtifactId): ReadonlyArray<ArtifactId>;

  /** Finds the files `artifactId` contributes content to. */
  findContributedFiles(artifactId: ArtifactId): ReadonlyArray<FileEntry>;
}

/**
 * Builds the reverse index for one plan.
 *
 * The file-to-artifact edge is written only on the file, so the artifact-to-file direction exists nowhere in the
 * payload until it is derived here. That half is plan-only, having no counterpart in a closure, which is why the
 * artifact-to-artifact half lives in `buildDependentsIndex` and is composed here. Build once per plan: a provenance
 * pane issues many lookups against one plan.
 */
export function buildTraversalIndex(plan: Plan): TraversalIndex {
  const findDependents = buildDependentsIndex(plan);

  const contributedFiles = new Map<ArtifactId, Array<FileEntry>>();
  for (const file of plan.files) {
    for (const contribution of file.contributors.artifacts) {
      appendTo(contributedFiles, contribution.artifactId, file);
    }
  }

  return {
    findDependents,
    findContributedFiles: (artifactId) => contributedFiles.get(artifactId) ?? [],
  };
}
