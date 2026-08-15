import { resolveDeployedNames } from '../deployment/resolveDeployedNames.ts';
import { resolveDeployedPath } from '../deployment/resolveDeployedPath.ts';
import { appendTo } from '../portable/appendTo.ts';
import { compareStrings } from '../portable/compareStrings.ts';
import type { ClosureArtifact } from '../schemas/closure-schemas.ts';
import type { KindDescriptor } from '../schemas/descriptor-schemas.ts';
import type { RenderTarget } from '../schemas/render-target-schemas.ts';
import type { ArtifactId, KindId } from '../schemas/scalar-schemas.ts';
import type { DeploymentDiagnostic } from './ValidationDiagnostic.ts';

/** What finding the destinations a composition's artifacts contend for reads. */
export interface FindDeploymentCollisionsInput {
  /** The artifacts the closure reached, in id order. */
  readonly artifacts: ReadonlyArray<ClosureArtifact>;
  readonly kinds: ReadonlyArray<KindDescriptor>;
  readonly targets: ReadonlyArray<RenderTarget>;
}

/**
 * Finds every destination more than one of a target's artifacts deploys to, ordered by target and then by path.
 *
 * Two artifacts land on one path when a kind's name template maps two slugs to one name, or when two kinds rooted at
 * one directory produce a name both could have written. Neither name resolution nor the render-target consistency pass
 * can see it: one holds a single lookup with no artifact set to compare against, the other has no catalog to learn
 * which slugs a template will produce. So the composition is the first place it is visible, and validate is where it
 * is visible without reading a destination.
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
    const byPath = new Map<string, Array<ArtifactId>>();

    for (const deployment of target.deployments) {
      if (deployment.form !== 'tree') {
        continue;
      }
      const routed = byKind.get(deployment.kindId) ?? [];
      for (const artifact of routed) {
        const deployedName = resolveDeployedName(target.id, artifact.id);
        if (deployedName !== undefined) {
          appendTo(byPath, resolveDeployedPath(deployment, deployedName), artifact.id);
        }
      }
    }

    return [...byPath]
      .filter(([, contenders]) => contenders.length > 1)
      .toSorted(([left], [right]) => compareStrings(left, right))
      .map(([path, contenders]) => describeCollision(target.id, path, contenders.toSorted(compareStrings)));
  });
}

// region | Helpers

/** States that a destination more than one artifact deploys to has no answer a declaration decides. */
function describeCollision(
  targetId: string,
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

// endregion | Helpers
