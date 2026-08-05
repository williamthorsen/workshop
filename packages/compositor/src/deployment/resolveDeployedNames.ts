import type { RenderTarget } from '../schemas/render-target-schemas.ts';
import type { ArtifactId, KindId, TargetId } from '../schemas/scalar-schemas.ts';
import type { DeployedNameLookup } from '../tokens/rewriteTokens.ts';
import { renderDeployedName } from './name-templates.ts';

/** One artifact this pass reads: what identifies it, and the name it deploys under where a kind's template is wrong. */
export interface DeployableArtifact {
  readonly id: ArtifactId;
  readonly kindId: KindId;
  readonly slug: string;
  /**
   * Overrides the name the kind's template would produce.
   *
   * An input rather than a field this pass derives, because the artifact declares it and reading an artifact's own
   * declarations is not this pass's job.
   */
  readonly deployedName?: string;
}

/**
 * Resolves the name every artifact deploys under for every target, as the lookup a token rewrite reads.
 *
 * Names derive from slug, kind, and target alone, which is what lets this run before any body is rendered: a referent
 * token rewrites to the name its artifact deploys under, so resolving names during the rewrite would make the two
 * depend on each other.
 *
 * An artifact whose kind a target declares no deployment for resolves to nothing, which is the deployability check a
 * token naming an artifact answers before rendering. That check is per kind: whether one artifact of a deployed kind
 * suppresses its own deployment is a fact the artifact declares, and nothing reads artifact declarations yet.
 *
 * A region-routed artifact resolves to the host path, so a token naming one renders the file a reader would open to
 * find it. Its own `deployedName` does not apply there: that field overrides the name a kind's template would produce,
 * and an artifact aggregated into a host has no name of its own to override.
 *
 * Two artifacts resolving to one name is not detected here, having no artifact-set to compare against a single lookup.
 */
export function resolveDeployedNames(
  artifacts: ReadonlyArray<DeployableArtifact>,
  targets: ReadonlyArray<RenderTarget>,
): DeployedNameLookup {
  const byTarget = new Map<TargetId, Map<ArtifactId, string>>();

  for (const target of targets) {
    const deployments = new Map(target.deployments.map((deployment) => [deployment.kindId, deployment]));
    const names = new Map<ArtifactId, string>();
    for (const artifact of artifacts) {
      const deployment = deployments.get(artifact.kindId);
      if (deployment === undefined) {
        continue;
      }
      names.set(
        artifact.id,
        deployment.form === 'region'
          ? deployment.host
          : (artifact.deployedName ?? renderDeployedName(deployment.nameTemplate, artifact.slug)),
      );
    }
    byTarget.set(target.id, names);
  }

  return (targetId, artifactId) => byTarget.get(targetId)?.get(artifactId);
}
