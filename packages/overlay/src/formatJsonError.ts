/** Serialize an error message into a single-line JSON string. */
export function formatJsonError(message: string): string {
  return JSON.stringify({ error: message });
}
