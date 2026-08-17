import type { ArtifactId, TargetId } from '../schemas/scalar-schemas.ts';

/**
 * Where a binding fault sits, which is as much of the inlay, the target, the host, and the filler as the fault knows.
 *
 * `inlayName` is the one field every code carries, a binding being addressed by the inlay it names. `targetId` is
 * absent where the fault is the config's alone rather than one target's, and the two artifact fields are absent where
 * the binding as a whole is at fault rather than one site or one filler.
 */
export interface BindingRef {
  readonly inlayName: string;
  readonly targetId?: TargetId;
  /** The artifact whose body declared the inlay being filled. */
  readonly hostArtifactId?: ArtifactId;
  /** The bound artifact at fault. */
  readonly artifactId?: ArtifactId;
}

/**
 * One fault in what a config bound to an inlay.
 *
 * Data rather than a thrown error, so one run reports every mistake a config carries and a reader attaches each to the
 * entry an author wrote. A fault that leaves a body silently short of content it was written to carry also blocks the
 * file, which is the plan's own answer and not this diagnostic's.
 */
export interface BindingDiagnostic {
  readonly code: BindingFailure;
  readonly message: string;
  readonly at: BindingRef;
}

/**
 * Why a binding could not be filled.
 *
 * `unmatched-inlay` is a binding naming an inlay no artifact declares, which is the config's alone and reported once.
 * The other three are one target's. `undeployed-kind` is a filler of a kind the target takes none of, which is the
 * standing rule that a kind a target declares no deployment for does not deploy there. `nested-inlay` is a filler
 * whose own body declares an inlay, which a fill one level deep can never reach. `unrenderable-binding` is a filler
 * whose own render ended, leaving no body to splice.
 */
export type BindingFailure = 'nested-inlay' | 'undeployed-kind' | 'unmatched-inlay' | 'unrenderable-binding';
