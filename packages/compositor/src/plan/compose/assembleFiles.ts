import { resolveDeployedNames } from '../../deployment/resolveDeployedNames.ts';
import { appendTo } from '../../portable/appendTo.ts';
import { compareStrings } from '../../portable/compareStrings.ts';
import type { BlobStore } from '../../portable/createBlobStore.ts';
import type { ClosureArtifact } from '../../schemas/closure-schemas.ts';
import type { FileEntry } from '../../schemas/file-schemas.ts';
import type { ArtifactId, KindId } from '../../schemas/scalar-schemas.ts';
import type { ClaimedArtifact, TargetState } from '../../snapshot/readTargetState.ts';
import type { PlannableSnapshot } from './assertSnapshotFits.ts';
import { describeAmbiguousClaim } from './file-entries.ts';
import { planRegionFile } from './planRegionFile.ts';
import { planTreeFiles } from './planTreeFiles.ts';
import type { ContentVerdict, TargetPlanContext } from './TargetPlanContext.ts';

/** What assembling one composition's files reads. */
export interface AssembleFilesInput {
  readonly snapshot: PlannableSnapshot;
  /** The artifacts the closure reached, in id order. */
  readonly artifacts: ReadonlyArray<ClosureArtifact>;
  readonly blobs: BlobStore;
}

/** What assembling one composition's files produced. */
export interface FileAssembly {
  /** Ordered by target, then by path. */
  readonly files: ReadonlyArray<FileEntry>;
  /** One verdict per destination an artifact owns computed content at, keyed by artifact. */
  readonly verdicts: ReadonlyMap<ArtifactId, ReadonlyArray<ContentVerdict>>;
  /** The artifacts a destination still holds that the closure does not, ordered by id. */
  readonly departed: ReadonlyArray<ClaimedArtifact>;
}

/**
 * Assembles every file every target holds after the composition, and judges each artifact's content along the way.
 *
 * Removal follows from a destination nothing plans, not from a render that failed: a blocked destination is planned at
 * the content it holds, so it is never swept. That is what keeps a directive an author has just broken from proposing
 * the deletion of everything the artifact had deployed.
 */
export function assembleFiles(input: AssembleFilesInput): FileAssembly {
  const { artifacts, blobs, snapshot } = input;
  const reached = new Set(artifacts.map(({ id }) => id));
  const claimable = new Map(
    snapshot.catalog.entries.map(({ id, kindId, slug }) => [id, { id, kindId, slug }] as const),
  );
  const artifactsByKind = groupByKind(artifacts);
  const resolveDeployedName = resolveDeployedNames(snapshot.catalog.entries, snapshot.targets);
  const stateByTarget = new Map(snapshot.targetState.map((state) => [state.targetId, state]));

  const files: Array<FileEntry> = [];
  const verdicts = new Map<ArtifactId, Array<ContentVerdict>>();
  const departed = new Map<ArtifactId, ClaimedArtifact>();

  const targets = snapshot.targets.toSorted((left, right) => compareStrings(left.id, right.id));

  for (const target of targets) {
    const state = stateByTarget.get(target.id);
    // Every target the snapshot carries was scanned, the scan running over the same list.
    if (state === undefined) {
      continue;
    }

    const context: TargetPlanContext = {
      targetId: target.id,
      blobs,
      artifactsByKind,
      renders: snapshot.renders.get(target.id) ?? new Map(),
      assets: snapshot.assets,
      claimed: new Map(state.claimed.map((claimed) => [claimed.path, claimed])),
      hosts: new Map(state.hosts.map((host) => [host.kindId, host])),
      resolveDeployedName,
    };

    const planned: Array<FileEntry> = [];
    for (const deployment of target.deployments) {
      const result =
        deployment.form === 'tree' ? planTreeFiles(context, deployment) : planRegionFile(context, deployment);
      planned.push(...result.files);
      for (const { artifactId, verdict } of result.verdicts) {
        appendTo(verdicts, artifactId, verdict);
      }
    }

    const removals = planRemovals(context, state, new Set(planned.map(({ path }) => path)), reached);
    for (const artifact of [...removals.departed, ...findDepartedContributors(state, reached, claimable)]) {
      departed.set(artifact.id, artifact);
    }

    files.push(...[...planned, ...removals.files].toSorted((left, right) => compareStrings(left.path, right.path)));
  }

  return {
    files,
    verdicts,
    departed: departed
      .values()
      .toArray()
      .toSorted((left, right) => compareStrings(left.id, right.id)),
  };
}

// region | Helpers

/** Everything one target's removal sweep produced. */
interface Removals {
  readonly files: ReadonlyArray<FileEntry>;
  readonly departed: ReadonlyArray<ClaimedArtifact>;
}

/**
 * Finds the artifacts a host still carries a block for that the closure no longer holds.
 *
 * A contribution names its contributor by id alone, its markers standing an id rather than a slug, so one the catalog
 * no longer carries cannot be described and is left out. Its block vanishes from the planned region either way.
 */
function findDepartedContributors(
  state: TargetState,
  reached: ReadonlySet<ArtifactId>,
  claimable: ReadonlyMap<ArtifactId, ClaimedArtifact>,
): Array<ClaimedArtifact> {
  const departed: Array<ClaimedArtifact> = [];

  for (const host of state.hosts) {
    if (host.state !== 'present') {
      continue;
    }
    for (const contribution of host.contributions) {
      const artifact = claimable.get(contribution.key);
      if (artifact !== undefined && !reached.has(contribution.key)) {
        departed.push(artifact);
      }
    }
  }

  return departed;
}

/** Groups the closure's artifacts by kind, keeping the id order they arrive in. */
function groupByKind(artifacts: ReadonlyArray<ClosureArtifact>): ReadonlyMap<KindId, ReadonlyArray<ClosureArtifact>> {
  const byKind = new Map<KindId, Array<ClosureArtifact>>();
  for (const artifact of artifacts) {
    appendTo(byKind, artifact.kindId, artifact);
  }
  return byKind;
}

/** Plans the removal of everything a target holds that nothing planned, with the artifacts departing alongside. */
function planRemovals(
  context: TargetPlanContext,
  state: TargetState,
  plannedPaths: ReadonlySet<string>,
  reached: ReadonlySet<ArtifactId>,
): Removals {
  const files: Array<FileEntry> = [];
  const departed: Array<ClaimedArtifact> = [];

  for (const claimed of state.claimed) {
    if (plannedPaths.has(claimed.path)) {
      continue;
    }

    files.push({
      targetId: context.targetId,
      path: claimed.path,
      status: 'removed',
      ownership: { kind: 'full' },
      ...(claimed.claims.length > 1 && { blocked: { reason: describeAmbiguousClaim(claimed) } }),
      current: context.blobs.addEncoded(claimed.hash, claimed.body),
      contributors: { artifacts: claimed.claims.map(({ id }) => ({ artifactId: id })), partials: [] },
    });
    departed.push(...claimed.claims.filter(({ id }) => !reached.has(id)));
  }

  return { files, departed };
}

// endregion | Helpers
