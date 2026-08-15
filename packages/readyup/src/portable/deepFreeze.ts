/** Freezes a value and every value reachable from it. */
export function deepFreeze(value: unknown): void {
  freezeReachable(value, new WeakSet());
}

// region | Helpers

/** Freezes `value` and its reachable values, stopping at a value `seen` already holds. */
function freezeReachable(value: unknown, seen: WeakSet<object>): void {
  if (value === null || typeof value !== 'object') return;
  // A cyclic input would otherwise recur forever, and a shared value would be walked once per holder.
  if (seen.has(value)) return;
  seen.add(value);
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    freezeReachable(nested, seen);
  }
}

// endregion | Helpers
