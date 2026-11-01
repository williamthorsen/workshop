/** Returns the first key of `record` that `known` does not list. */
export function findUnknownKey(record: Record<string, unknown>, known: readonly string[]): string | undefined {
  return Object.keys(record).find((key) => !known.includes(key));
}
