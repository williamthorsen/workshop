import type { ArtifactId, PartialId } from '../schemas/scalar-schemas.ts';

/** One token that could not be rendered for a target, located where an author can find it. */
export interface TokenDiagnostic {
  readonly code: TokenFailure;
  readonly message: string;
  readonly at: TokenRef;
}

/**
 * Why a token could not be rendered.
 *
 * `undeployed-referent` is the deployability check every artifact-naming kind runs: a token may only address an
 * artifact the target actually receives.
 */
export type TokenFailure = 'undeployed-referent' | 'unmapped-name';

/** Where a token sits: the artifact hosting it, the token as written, and the partial it arrived through. */
export interface TokenRef {
  readonly host: ArtifactId;
  readonly token: string;
  /** Absent when the token sits in the host's own body rather than in a transcluded partial. */
  readonly partialId?: PartialId;
}
