/** Extract a displayable message from an unknown thrown value. */
export function extractMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
