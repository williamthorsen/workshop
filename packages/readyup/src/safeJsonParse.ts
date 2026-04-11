/** Parse a JSON string, returning `undefined` instead of throwing on invalid input. */
export function safeJsonParse(content: string): unknown {
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed;
  } catch {
    return undefined;
  }
}
