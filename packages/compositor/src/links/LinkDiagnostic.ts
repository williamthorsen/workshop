import type { ArtifactId, PartialId } from '../schemas/scalar-schemas.ts';

/** One link target that could not be rewritten for a target, located where an author can find it. */
export interface LinkDiagnostic {
  readonly code: LinkFailure;
  readonly message: string;
  readonly at: LinkRef;
}

/**
 * Why a link target could not be rewritten.
 *
 * `out-of-tree` is a relative target that climbs past the destination's root, which no absolute path under that root
 * could express.
 */
export type LinkFailure = 'out-of-tree';

/** Where a link sits: the artifact hosting it, the target as written, and the partial it arrived through. */
export interface LinkRef {
  readonly host: ArtifactId;
  readonly target: string;
  /** Absent when the link sits in the host's own body rather than in a transcluded partial. */
  readonly partialId?: PartialId;
}
