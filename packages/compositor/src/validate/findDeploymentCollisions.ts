import { resolveDeployedNames } from '../deployment/resolveDeployedNames.ts';
import { resolveDeployedPath } from '../deployment/resolveDeployedPath.ts';
import { appendTo } from '../portable/appendTo.ts';
import { compareStrings } from '../portable/compareStrings.ts';
import type { ClosureArtifact } from '../schemas/closure-schemas.ts';
import type { KindDescriptor } from '../schemas/descriptor-schemas.ts';
import type { RenderTarget } from '../schemas/render-target-schemas.ts';
import type { ArtifactId, KindId, TargetId } from '../schemas/scalar-schemas.ts';
import type { DeploymentDiagnostic } from './ValidationDiagnostic.ts';

/** What finding the destinations a composition's artifacts contend for reads. */
export interface FindDeploymentCollisionsInput {
  /** The artifacts the closure reached, in id order. */
  readonly artifacts: ReadonlyArray<ClosureArtifact>;
  readonly kinds: ReadonlyArray<KindDescriptor>;
  readonly targets: ReadonlyArray<RenderTarget>;
}

/**
 * Finds every destination more than one of a target's deployments writes, ordered by target and then by path.
 *
 * Two artifacts land on one path when a kind's name template maps two slugs to one name, or when two kinds rooted at
 * one directory produce a name both could have written. Neither name resolution nor the render-target consistency pass
 * can see it: one holds a single lookup with no artifact set to compare against, the other has no catalog to learn
 * which slugs a template will produce. So the composition is the first place it is visible, and validate is where it
 * is visible without reading a destination.
 *
 * A region host counts as one destination however many artifacts aggregate into it, that being what a host is for. A
 * tree destination landing on one is a collision like any other, and it is the case `assertRenderTargetsAreConsistent`
 * cannot reach, checking a host against layout roots rather than against the names a template will produce.
 *
 * Only the entry file each artifact deploys is compared. What an artifact ships beside it lands under the same name, so
 * a collision among assets is one among the entries that carry them.
 */
export function findDeploymentCollisions(input: FindDeploymentCollisionsInput): Array<DeploymentDiagnostic> {
  const { artifacts, targets } = input;
  const emitting = new Set(input.kinds.filter((kind) => kind.emitsFiles).map(({ id }) => id));
  const deployed = artifacts.filter((artifact) => emitting.has(artifact.kindId));
  const resolveDeployedName = resolveDeployedNames(deployed, targets);

  const byKind = new Map<KindId, Array<ClosureArtifact>>();
  for (const artifact of deployed) {
    appendTo(byKind, artifact.kindId, artifact);
  }

  return targets.flatMap((target) => {
    const byPath = new Map<string, Array<ReadonlyArray<ArtifactId>>>();

    for (const deployment of target.deployments) {
      const routed = byKind.get(deployment.kindId) ?? [];
      if (routed.length === 0) {
        continue;
      }
      if (deployment.form === 'region') {
        appendTo(
          byPath,
          deployment.host,
          routed.map(({ id }) => id),
        );
        continue;
      }
      for (const artifact of routed) {
        const deployedName = resolveDeployedName(target.id, artifact.id);
        if (deployedName !== undefined) {
          appendTo(byPath, resolveDeployedPath(deployment, deployedName), [artifact.id]);
        }
      }
    }

    return [...byPath]
      .filter(([, writers]) => writers.length > 1)
      .toSorted(([left], [right]) => compareStrings(left, right))
      .map(([path, writers]) => describeCollision(target.id, path, orderContenders(writers)));
  });
}

// region | Helpers

/** States that a destination more than one artifact deploys to has no answer a declaration decides. */
function describeCollision(
  targetId: TargetId,
  path: string,
  artifactIds: ReadonlyArray<ArtifactId>,
): DeploymentDiagnostic {
  const named = artifactIds.map((artifactId) => `"${artifactId}"`).join(', ');

  return {
    code: 'destination-collision',
    message: `Artifacts ${named} all deploy to this destination, so which of them it should hold is undecidable.`,
    at: { targetId, path, artifactIds },
  };
}

/** Names every artifact contending for one destination once, in id order. */
function orderContenders(writers: ReadonlyArray<ReadonlyArray<ArtifactId>>): Array<ArtifactId> {
  return [...new Set(writers.flat())].toSorted(compareStrings);
}

// endregion | Helpers
