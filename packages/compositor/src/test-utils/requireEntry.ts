/**
 * The entry at `index`, throwing when the array is shorter than that.
 *
 * Indexing a fixture yields `T | undefined` under `noUncheckedIndexedAccess`, and a test that reaches past the end of
 * its own fixture should say so rather than assert the absence away.
 */
export function requireEntry<T>(entries: ReadonlyArray<T>, index: number): T {
  const entry = entries.at(index);
  if (entry === undefined) {
    throw new Error(`Fixture holds no entry at index ${index}.`);
  }
  return entry;
}
