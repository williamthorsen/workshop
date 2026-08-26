/** File entries: what every planner assembles one of a plan's files from. */

import type { BlobStore } from '../../portable/createBlobStore.ts';
import type { FileContributors, FileEntry, FileOwnership, FileSide } from '../../schemas/file-schemas.ts';
import type { TargetId } from '../../schemas/scalar-schemas.ts';
import type { ClaimedFile } from '../../snapshot/readTargetState.ts';
import type { ContentVerdict } from './TargetPlanContext.ts';

/** What blocking a destination at the content it holds needs. */
export interface BlockAtCurrentInput {
  readonly targetId: TargetId;
  readonly path: string;
  readonly ownership: FileOwnership;
  readonly contributors: FileContributors;
  readonly reason: string;
  /** The body the destination holds now, absent where it holds none. */
  readonly current: FileSide | undefined;
}

/**
 * Plans a destination whose content could not be computed: it stands at the body it holds, the refusal recorded on it.
 *
 * Both sides name that body, since the plan shows each destination as it will stand and nothing will be written here.
 * A destination holding nothing yields no entry at all, nothing being what will stand there.
 */
export function blockAtCurrent(input: BlockAtCurrentInput): FileEntry | undefined {
  if (input.current === undefined) {
    return undefined;
  }

  return {
    targetId: input.targetId,
    path: input.path,
    status: 'unchanged',
    ownership: input.ownership,
    blocked: { reason: input.reason },
    current: input.current,
    planned: input.current,
    contributors: input.contributors,
  };
}

/** Reads the status two sides describe, the rule `assertPlanIsConsistent` holds every file to. */
export function classifyStatus(current: FileSide | undefined, planned: FileSide): ContentVerdict {
  if (current === undefined) {
    return 'added';
  }
  return current.hash === planned.hash ? 'unchanged' : 'changed';
}

/** States why a path whose provenance is undecidable may be neither written nor removed. */
export function describeAmbiguousClaim(claimed: ClaimedFile): string {
  const named = claimed.claims.map(({ id }) => `"${id}"`).join(', ');
  const matched = `The destination matches the claim rules of ${named}`;
  return `${matched}, so which artifact deployed it is undecidable from shape.`;
}

/** Registers the body a destination holds now, or undefined where it holds none. */
export function readCurrentSide(blobs: BlobStore, claimed: ClaimedFile | undefined): FileSide | undefined {
  return claimed === undefined ? undefined : blobs.addEncoded(claimed.hash, claimed.body);
}
