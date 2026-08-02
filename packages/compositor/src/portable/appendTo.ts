/** Appends `value` to the list `key` maps to, starting one when the key is new. */
export function appendTo<K, V>(index: Map<K, Array<V>>, key: K, value: V): void {
  const existing = index.get(key);
  if (existing === undefined) {
    index.set(key, [value]);
  } else {
    existing.push(value);
  }
}
