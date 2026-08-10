/**
 * Extract a remediation hint from an unknown thrown value, or `undefined` when it carries none.
 *
 * Reads the property off any error rather than off `RdyError` alone, so a boundary that re-wraps a
 * failure forwards the hint with one extra argument instead of a branch per throwing module.
 */
export function extractHint(error: unknown): string | undefined {
  if (error instanceof Error && 'hint' in error && typeof error.hint === 'string') return error.hint;
  return undefined;
}

/** Extract a displayable message from an unknown thrown value. */
export function extractMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
