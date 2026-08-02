/** Collects the id of every entry in a table. */
export function collectIds(entries: ReadonlyArray<{ id: string }>): ReadonlySet<string> {
  return new Set(entries.map((entry) => entry.id));
}
