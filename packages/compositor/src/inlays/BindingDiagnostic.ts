import type { ArtifactId, TargetId } from '../schemas/scalar-schemas.ts';

/**
 * Where a binding fault sits, which is as much of the inlay, the target, the host, and the filler as the fault knows.
 *
 * `inlayName` is the one field every code carries, a binding being addressed by the inlay it names. Each other field is
 * present only where it is part of what went wrong: `targetId` where the fault is one target's rather than the config's
 * alone, `artifactId` where one filler is at fault rather than the binding as a whole, and `hostArtifactId` where the
 * fault belongs to one host. A fault decided by the filler and the target together carries no host, being answered once
 * for every host that declares the inlay.
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
 * standing rule that a kind a target declares no deployment for does not deploy there; it is decided by the filler and
 * the target alone, so it is reported once however many hosts declare the inlay. `nested-inlay` is a filler whose own
 * body declares an inlay, which a fill one level deep can never reach, and `unrenderable-binding` is a filler whose own
 * render ended, leaving no body to splice; each of those blocks a host, so each is reported once per host.
 */
export type BindingFailure = 'nested-inlay' | 'undeployed-kind' | 'unmatched-inlay' | 'unrenderable-binding';
