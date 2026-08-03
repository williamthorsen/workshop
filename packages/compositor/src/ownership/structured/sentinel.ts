/** Sentinels: reading and writing the mark that tells an engine's item from a foreign one. */

import type { OwnedItemsSpec } from './OwnedItemsSpec.ts';

type Sentinel = OwnedItemsSpec['sentinel'];

/** Reports whether `item` carries the sentinel, which is what makes it the engine's to rewrite or remove. */
export function carriesSentinel(item: unknown, sentinel: Sentinel): boolean {
  let cursor = item;
  for (const key of sentinel.path) {
    if (!isRecord(cursor)) {
      return false;
    }
    cursor = cursor[key];
  }
  return cursor === sentinel.value;
}

/**
 * Returns `item` with the sentinel written into it, so an item the engine writes is one it can find again.
 *
 * Stamping is what removes the original's refusal to write an unmarked item: an item that could not be found again is
 * now unconstructable rather than rejected. An item that cannot hold the sentinel -- a scalar where the path expects a
 * mapping -- is a fault in the declaration or in what the caller built, so it throws.
 */
export function stampSentinel(item: unknown, sentinel: Sentinel): unknown {
  if (sentinel.path.length === 0) {
    throw new Error('A sentinel must name at least one key, since a whole item cannot be its own mark.');
  }
  if (!isRecord(item)) {
    throw new Error(`Cannot mark an item with a sentinel at "${sentinel.path.join('.')}": the item is not a mapping.`);
  }
  return writeAtPath(item, sentinel.path, sentinel.value);
}

// region | Helpers

/** True for a plain object, the only shape a sentinel path can descend through. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns a copy of `target` carrying `value` at `path`, creating the mappings the path descends through. */
function writeAtPath(
  target: Record<string, unknown>,
  path: ReadonlyArray<string>,
  value: string,
): Record<string, unknown> {
  const [key, ...rest] = path;
  if (key === undefined) {
    return target;
  }
  if (rest.length === 0) {
    return { ...target, [key]: value };
  }
  const child = target[key];
  if (child !== undefined && child !== null && !isRecord(child)) {
    throw new Error(`Cannot mark an item with a sentinel at "${path.join('.')}": "${key}" is not a mapping.`);
  }
  return { ...target, [key]: writeAtPath(isRecord(child) ? child : {}, rest, value) };
}

// endregion | Helpers
