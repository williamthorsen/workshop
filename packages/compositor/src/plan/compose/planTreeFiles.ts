import { resolveDeployedPath } from '../../deployment/resolveDeployedPath.ts';
import type { ArtifactRender } from '../../render/renderArtifact.ts';
import type { ClosureArtifact } from '../../schemas/closure-schemas.ts';
import type { FileContributors, FileEntry, FileOwnership, FileSide } from '../../schemas/file-schemas.ts';
import type { TreeKindDeployment } from '../../schemas/render-target-schemas.ts';
import { blockAtCurrent, classifyStatus, describeAmbiguousClaim, readCurrentSide } from './file-entries.ts';
import type { ArtifactVerdict, PlannedFiles, TargetPlanContext } from './TargetPlanContext.ts';

/**
 * Plans the files one tree deployment writes: each artifact's rendered entry file, and every asset it ships beside it.
 *
 * An artifact whose render failed is blocked across its whole file set here rather than per file. Its assets would
 * otherwise write cleanly, leaving a fresh diagram beside a body a stale render left behind, and a half-deployed
 * artifact is worse than one left alone.
 */
export function planTreeFiles(context: TargetPlanContext, deployment: TreeKindDeployment): PlannedFiles {
  const files: Array<FileEntry> = [];
  const verdicts: Array<ArtifactVerdict> = [];

  const deployed = context.artifactsByKind.get(deployment.kindId) ?? [];

  for (const artifact of deployed) {
    const deployedName = context.resolveDeployedName(context.targetId, artifact.id);
    const render = context.renders.get(artifact.id);
    // A kind emitting no files is never rendered, and a name resolves for every kind a target deploys.
    if (deployedName === undefined || render === undefined) {
      continue;
    }

    for (const destination of collectDestinations(context, deployment, artifact, deployedName, render)) {
      const claimed = context.claimed.get(destination.path);
      const current = readCurrentSide(context.blobs, claimed);

      if (destination.planned === undefined) {
        const blocked = blockAtCurrent({
          targetId: context.targetId,
          path: destination.path,
          ownership: FULL_OWNERSHIP,
          contributors: destination.contributors,
          reason: destination.reason,
          current,
        });
        if (blocked !== undefined) {
          files.push(blocked);
        }
        continue;
      }

      const ambiguous = claimed !== undefined && claimed.claims.length > 1;
      const status = classifyStatus(current, destination.planned);
      files.push({
        targetId: context.targetId,
        path: destination.path,
        status,
        ownership: FULL_OWNERSHIP,
        ...(ambiguous && { blocked: { reason: describeAmbiguousClaim(claimed) } }),
        ...(current !== undefined && { current }),
        planned: destination.planned,
        contributors: destination.contributors,
      });
      verdicts.push({ artifactId: artifact.id, verdict: status });
    }
  }

  return { files, verdicts };
}

// region | Helpers

/** Collects every destination one artifact owns under a deployment, with the body planned for each. */
function collectDestinations(
  context: TargetPlanContext,
  deployment: TreeKindDeployment,
  artifact: ClosureArtifact,
  deployedName: string,
  render: ArtifactRender,
): Array<TreeDestination> {
  const soleContributor: FileContributors = { artifacts: [{ artifactId: artifact.id }], partials: [] };
  const assets = context.assets.get(artifact.id) ?? [];
  const reason = render.status === 'rendered' ? '' : describeUnrenderable(render);

  return [
    {
      path: resolveDeployedPath(deployment, deployedName),
      contributors: render.status === 'rendered' ? render.contributors : soleContributor,
      planned: render.status === 'rendered' ? context.blobs.addUtf8(render.content) : undefined,
      reason,
    },
    ...assets.map((asset) => ({
      path: resolveDeployedPath(deployment, deployedName, asset.relativePath),
      contributors: soleContributor,
      planned: render.status === 'rendered' ? context.blobs.addEncoded(asset.hash, asset.body) : undefined,
      reason,
    })),
  ];
}

/** States why an artifact's content could not be computed for a target. */
function describeUnrenderable(render: ArtifactRender): string {
  // `not-deployed` cannot arrive: a caller reaches an artifact through the deployment its kind resolved to.
  return render.status === 'failed'
    ? `The content could not be rendered: ${render.diagnostic.message}`
    : 'The target deploys none of this artifact’s kind.';
}

/** A tree deployment writes each artifact whole, no part of a destination belonging to anything else. */
const FULL_OWNERSHIP: FileOwnership = { kind: 'full' };

/**
 * One destination a tree deployment writes for one artifact.
 *
 * `planned` is absent where the render failed, and `reason` then states why nothing could be computed for it.
 */
interface TreeDestination {
  readonly path: string;
  readonly contributors: FileContributors;
  readonly planned: FileSide | undefined;
  readonly reason: string;
}

// endregion | Helpers
