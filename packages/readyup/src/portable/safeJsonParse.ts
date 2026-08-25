/** Returns a JSON string parsed, or `undefined` where the input is invalid. */
export function safeJsonParse(content: string): unknown {
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed;
  } catch {
    return undefined;
  }
}
