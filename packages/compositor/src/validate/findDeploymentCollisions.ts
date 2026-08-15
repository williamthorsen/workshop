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
 * A destination is counted per deployment rather than per artifact, so a region host stays uncontested however many
 * artifacts aggregate into it -- that being what a host is for -- while a tree destination landing on one collides
 * like any other. That is the case `assertRenderTargetsAreConsistent` cannot reach, checking a host against layout
 * roots rather than against the names a template will produce.
 *
 * Two region deployments naming one host collide too, which is a position the engine holds in two minds.
 * `readTargetState` anticipates the configuration, attributing a host's contributions per kind, and nothing in the
 * declaration checks refuses it. Composition decides against it: each `planRegionFile` call injects its own region into
 * the host's original body, so the two planned bodies each drop the other's region, and composing writes neither,
 * collapsing the pair into one blocked destination where the host exists. Reporting it here says before a plan is
 * composed what composing would say after, which is the whole of what this pass is for. Supporting the configuration
 * is a composition change, not a validation one.
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
    const byPath = new Map<string, Array<Writer>>();

    for (const deployment of target.deployments) {
      const { kindId } = deployment;
      const routed = byKind.get(kindId) ?? [];
      if (routed.length === 0) {
        continue;
      }
      if (deployment.form === 'region') {
        appendTo(byPath, deployment.host, { kindId, artifactIds: routed.map(({ id }) => id) });
        continue;
      }
      for (const artifact of routed) {
        const deployedName = resolveDeployedName(target.id, artifact.id);
        if (deployedName !== undefined) {
          appendTo(byPath, resolveDeployedPath(deployment, deployedName), { kindId, artifactIds: [artifact.id] });
        }
      }
    }

    return [...byPath]
      .filter(([, writers]) => writers.length > 1)
      .toSorted(([left], [right]) => compareStrings(left, right))
      .map(([path, writers]) => describeCollision(target.id, path, writers));
  });
}

// region | Helpers

/** States that a destination more than one of a target's deployments writes has no answer a declaration decides. */
function describeCollision(targetId: TargetId, path: string, writers: ReadonlyArray<Writer>): DeploymentDiagnostic {
  const kindIds = orderIds(writers.map(({ kindId }) => kindId));
  const artifactIds = orderIds(writers.flatMap(({ artifactIds: ids }) => ids));
  const named = kindIds.map((kindId) => `"${kindId}"`).join(', ');

  return {
    code: 'destination-collision',
    message: `The deployments of ${named} all write this destination, so what it should hold is undecidable.`,
    at: { targetId, path, kindIds, artifactIds },
  };
}

/** Names each id once, in id order. */
function orderIds<Value extends string>(ids: ReadonlyArray<Value>): Array<Value> {
  return [...new Set(ids)].toSorted(compareStrings);
}

/** One deployment's claim on a destination, carrying the content it would write there. */
interface Writer {
  readonly kindId: KindId;
  readonly artifactIds: ReadonlyArray<ArtifactId>;
}

// endregion | Helpers
