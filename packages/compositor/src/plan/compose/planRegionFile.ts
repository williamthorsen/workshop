import { renderContributionMarkers } from '../../deployment/contribution-markers.ts';
import { injectRegion } from '../../ownership/injectRegion.ts';
import type { OwnershipOutcome } from '../../ownership/OwnershipOutcome.ts';
import type { RegionMarkers } from '../../ownership/RegionMarkers.ts';
import { removeRegion } from '../../ownership/removeRegion.ts';
import { renderContribution } from '../../ownership/renderContribution.ts';
import { compareStrings } from '../../portable/compareStrings.ts';
import type { ClosureArtifact } from '../../schemas/closure-schemas.ts';
import type { FileContributors, FileEntry, FileOwnership, FileSide } from '../../schemas/file-schemas.ts';
import type { RegionKindDeployment } from '../../schemas/render-target-schemas.ts';
import type { PartialId, TargetId } from '../../schemas/scalar-schemas.ts';
import type { HostState } from '../../snapshot/readTargetState.ts';
import { blockAtCurrent, classifyStatus } from './file-entries.ts';
import type { ArtifactVerdict, PlannedFiles, TargetPlanContext } from './TargetPlanContext.ts';

/**
 * Plans the one file a region deployment writes: the host, with every contributing artifact's block inside its region.
 *
 * Contributions compose in artifact-id order, the order every id-keyed table in a plan runs in and the only one two
 * composes over one snapshot cannot disagree on.
 *
 * One contributor whose render failed blocks the whole host. Rebuilding the region without its block is something a
 * reader of the host cannot tell from a removal, and the host is a file the engine does not otherwise own.
 *
 * A host holding no region, with nothing routed to it, yields no entry: the engine has neither content there nor a
 * region to take away.
 */
export function planRegionFile(context: TargetPlanContext, deployment: RegionKindDeployment): PlannedFiles {
  const host = context.hosts.get(deployment.kindId);
  const hostContent = host?.state === 'present' ? host.content : undefined;
  const routed = context.artifactsByKind.get(deployment.kindId) ?? [];
  const ownership: FileOwnership = {
    kind: 'region',
    open: deployment.markers.open,
    close: deployment.markers.close,
  };

  const read = readContributions(context, routed);
  if (read.status === 'unrenderable') {
    const blocked = blockAtCurrent({
      ...position(context, deployment),
      ownership,
      contributors: nameContributors(deployment, routed, []),
      reason: read.reason,
      current: readHostSide(context, hostContent),
    });
    return { files: collect(blocked), verdicts: [] };
  }

  if (read.contributions.length === 0) {
    if (host?.state !== 'present' || host.region.state === 'absent') {
      return { files: [], verdicts: [] };
    }
    const outcome = removeRegion(host.content, deployment.markers);
    const contributors: FileContributors = { artifacts: [], partials: [] };
    return {
      files: collect(buildEntry(context, deployment, ownership, contributors, hostContent, outcome)),
      verdicts: [],
    };
  }

  const body = read.contributions
    .map(({ artifact, content }) => renderContribution(markersFor(deployment, artifact), content))
    .join('\n\n');
  const outcome = injectRegion(hostContent ?? '', deployment.markers, body);
  const contributors = nameContributors(deployment, routed, read.contributions);

  return {
    files: collect(buildEntry(context, deployment, ownership, contributors, hostContent, outcome)),
    verdicts: 'blocked' in outcome ? [] : judgeContributions(deployment, read.contributions, host),
  };
}

// region | Helpers

/**
 * Assembles the host's entry from what a region transform produced, blocking where it refused.
 *
 * The host's current body is registered here rather than by the caller, so a path that returns no file registers
 * nothing and a host the engine has no content in stays out of the blob table.
 */
function buildEntry(
  context: TargetPlanContext,
  deployment: RegionKindDeployment,
  ownership: FileOwnership,
  contributors: FileContributors,
  hostContent: string | undefined,
  outcome: OwnershipOutcome,
): FileEntry | undefined {
  const current = readHostSide(context, hostContent);

  if ('blocked' in outcome) {
    return blockAtCurrent({
      ...position(context, deployment),
      ownership,
      contributors,
      reason: outcome.blocked.reason,
      current,
    });
  }

  const planned = context.blobs.addUtf8(outcome.content);
  return {
    ...position(context, deployment),
    status: classifyStatus(current, planned),
    ownership,
    ...(current !== undefined && { current }),
    planned,
    contributors,
  };
}

/** Wraps an entry that may not exist as the list a caller returns. */
function collect(entry: FileEntry | undefined): Array<FileEntry> {
  return entry === undefined ? [] : [entry];
}

/** Every contributor's body, or the reason one of them has none. */
type ContributionRead =
  | { readonly status: 'read'; readonly contributions: ReadonlyArray<RenderedContribution> }
  | { readonly status: 'unrenderable'; readonly reason: string };

/** Judges each contributor against the block the host carries for it now. */
function judgeContributions(
  deployment: RegionKindDeployment,
  contributions: ReadonlyArray<RenderedContribution>,
  host: HostState | undefined,
): Array<ArtifactVerdict> {
  const held = new Map(host?.state === 'present' ? host.contributions.map(({ key, body }) => [key, body]) : []);

  return contributions.map(({ artifact, content }) => {
    const before = held.get(artifact.id);
    if (before === undefined) {
      return { artifactId: artifact.id, verdict: 'added' };
    }
    // Both sides pass through the renderer the host was written by, so its trimming is not restated wrongly here.
    const markers = markersFor(deployment, artifact);
    const same = renderContribution(markers, before) === renderContribution(markers, content);
    return { artifactId: artifact.id, verdict: same ? 'unchanged' : 'changed' };
  });
}

/** Renders the markers one contributor's block is delimited by. */
function markersFor(deployment: RegionKindDeployment, artifact: ClosureArtifact): RegionMarkers {
  return renderContributionMarkers(deployment.contributionMarkers, artifact.id);
}

/**
 * Names every artifact routed into the host, with the partials that reached it.
 *
 * A blocked host names its contributors too, which route there whether or not the host could be assembled; it carries
 * no partials, nothing having been read.
 */
function nameContributors(
  deployment: RegionKindDeployment,
  routed: ReadonlyArray<ClosureArtifact>,
  contributions: ReadonlyArray<RenderedContribution>,
): FileContributors {
  const named = new Set(contributions.flatMap(({ partials }) => [...partials]));

  return {
    artifacts: routed.map((artifact) => ({ artifactId: artifact.id, marker: markersFor(deployment, artifact) })),
    partials: [...named].toSorted(compareStrings) satisfies Array<PartialId>,
  };
}

/** Names the destination a region deployment writes, which is the host itself. */
function position(context: TargetPlanContext, deployment: RegionKindDeployment): { targetId: TargetId; path: string } {
  return { targetId: context.targetId, path: deployment.host };
}

/** Registers the body a host holds now, or nothing where it holds none. */
function readHostSide(context: TargetPlanContext, hostContent: string | undefined): FileSide | undefined {
  return hostContent === undefined ? undefined : context.blobs.addUtf8(hostContent);
}

/** Reads every contributor's rendered body, stopping at the first whose render produced none. */
function readContributions(context: TargetPlanContext, routed: ReadonlyArray<ClosureArtifact>): ContributionRead {
  const contributions: Array<RenderedContribution> = [];

  for (const artifact of routed) {
    const render = context.renders.get(artifact.id);
    if (render === undefined) {
      continue;
    }
    if (render.status !== 'rendered') {
      // `not-deployed` cannot arrive: a caller reaches an artifact through the deployment its kind resolved to.
      const reason =
        render.status === 'failed'
          ? `"${artifact.id}" could not be rendered: ${render.diagnostic.message}`
          : `"${artifact.id}" is of a kind the target does not deploy.`;
      return { status: 'unrenderable', reason };
    }
    contributions.push({ artifact, content: render.content, partials: render.contributors.partials });
  }

  return { status: 'read', contributions };
}

/** One contributor's rendered body, with the partials that reached it. */
interface RenderedContribution {
  readonly artifact: ClosureArtifact;
  readonly content: string;
  readonly partials: ReadonlyArray<PartialId>;
}

// endregion | Helpers
