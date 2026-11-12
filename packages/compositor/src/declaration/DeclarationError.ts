/**
 * Raised when a declaration a consumer wrote cannot be used as written.
 *
 * Published so a consumer can tell a mistake it can fix in its own declarations from a breach of the engine's
 * invariants, which throws a bare `Error`. A fault wrapping a lower-level failure keeps that failure as `cause`.
 */
export class DeclarationError extends Error {
  override readonly name = 'DeclarationError';
}
