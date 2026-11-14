/**
 * Raised for a failure that overlay anticipates, such as a rejected argument or a missing or outdated chezmoi.
 *
 * The CLI reports it as a JSON error and exits 2; any other thrown value is a bug in overlay. A fault wrapping a
 * lower-level failure keeps that failure as `cause`.
 */
export class OverlayError extends Error {
  override readonly name = 'OverlayError';
}
