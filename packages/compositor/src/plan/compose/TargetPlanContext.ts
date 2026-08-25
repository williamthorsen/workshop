import type { BlobStore } from '../../portable/createBlobStore.ts';
import type { ArtifactRender } from '../../render/renderArtifact.ts';
import type { ClosureArtifact } from '../../schemas/closure-schemas.ts';
import type { FileEntry } from '../../schemas/file-schemas.ts';
import type { ArtifactId, KindId, TargetId } from '../../schemas/scalar-schemas.ts';
import type { ArtifactAsset } from '../../snapshot/readArtifactAssets.ts';
import type { ClaimedFile, HostState, OwnedHostState } from '../../snapshot/readTargetState.ts';
import type { DeployedNameLookup } from '../../tokens/rewriteTokens.ts';

/** How one artifact's own content at one destination stands against what that destination holds. */
export type ContentVerdict = 'added' | 'changed' | 'unchanged';

/** One artifact's verdict at one destination, which its status is folded from. */
export interface ArtifactVerdict {
  readonly artifactId: ArtifactId;
  readonly verdict: ContentVerdict;
}

/**
 * What planning one deployment produced.
 *
 * A destination whose content could not be computed yields a file and no verdict: nothing was computed there for a
 * comparison to speak about, and an artifact blocked everywhere is one whose status rests on nothing. That is a
 * narrower rule than "a blocked destination yields no verdict" -- a contested destination is blocked with its
 * contenders' content computed, and each keeps the verdict that content decided.
 */
export interface PlannedFiles {
  readonly files: ReadonlyArray<FileEntry>;
  readonly verdicts: ReadonlyArray<ArtifactVerdict>;
}

/** What planning one target's files reads, gathered once for every deployment that target declares. */
export interface TargetPlanContext {
  readonly targetId: TargetId;
  readonly blobs: BlobStore;
  /** The closure's artifacts by kind, in id order, so a deployment reads only the artifacts it deploys. */
  readonly artifactsByKind: ReadonlyMap<KindId, ReadonlyArray<ClosureArtifact>>;
  readonly renders: ReadonlyMap<ArtifactId, ArtifactRender>;
  readonly assets: ReadonlyMap<ArtifactId, ReadonlyArray<ArtifactAsset>>;
  /** What the target holds now, by path. */
  readonly claimed: ReadonlyMap<string, ClaimedFile>;
  /** What the target's region hosts hold now, by the kind whose deployment declared each. */
  readonly hosts: ReadonlyMap<KindId, HostState>;
  /** What the target's entries hosts hold now, by path: an entries host belongs to no kind. */
  readonly ownedHosts: ReadonlyMap<string, OwnedHostState>;
  readonly resolveDeployedName: DeployedNameLookup;
}
