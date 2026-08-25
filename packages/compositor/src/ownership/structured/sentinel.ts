/** Sentinels: reading and writing the mark that tells an engine's item from a foreign one. */

import type { OwnedItemsSpec } from '../../schemas/owned-items-schemas.ts';

type Sentinel = OwnedItemsSpec['sentinel'];

/** The path segment standing for every element of the array at that position. */
export const WILDCARD_SEGMENT = '*';

/**
 * Reports whether the sentinel names a place the engine can write, which is what decides how an item is marked.
 *
 * Stampability is derived from the sentinel rather than declared beside it, so the two cannot disagree. A wildcard
 * names no single position to write at, and a containment match states what a value must hold rather than what it is,
 * so neither can be constructed; everything else can.
 */
export function allowsStamping(sentinel: Sentinel): boolean {
  return sentinel.match !== 'contains' && !sentinel.path.includes(WILDCARD_SEGMENT);
}

/**
 * Returns `item` marked as the engine's, stamping the sentinel where it can be written and requiring it where it cannot.
 *
 * A sentinel the engine can write makes an unmarked item unconstructable, which is what lets a caller build items
 * without knowing the mark. One it cannot write puts that back on the caller: the item is refused unless it already
 * has the mark, since an item written without one could never be found again.
 */
export function applySentinel(item: unknown, sentinel: Sentinel): unknown {
  if (allowsStamping(sentinel)) {
    return stampSentinel(item, sentinel);
  }
  if (!carriesSentinel(item, sentinel)) {
    throw new Error(
      `Cannot mark an item with the sentinel at "${sentinel.path.join('.')}": the sentinel cannot be written, and the ` +
        'item does not already have it.',
    );
  }
  return item;
}

/** Reports whether `item` has the sentinel, which is what makes it the engine's to rewrite or remove. */
export function carriesSentinel(item: unknown, sentinel: Sentinel): boolean {
  return findsMark(item, sentinel.path, sentinel);
}

/**
 * Returns `item` with the sentinel written into it, so an item the engine writes is one it can find again.
 *
 * An item that cannot hold the sentinel -- a scalar where the path expects a mapping -- is a fault in the declaration
 * or in what the caller built, so it throws. So is a sentinel that names no place to write at.
 */
export function stampSentinel(item: unknown, sentinel: Sentinel): unknown {
  if (sentinel.path.length === 0) {
    throw new Error('A sentinel must name at least one key, since a whole item cannot be its own mark.');
  }
  if (!allowsStamping(sentinel)) {
    throw new Error(`Cannot write the sentinel at "${sentinel.path.join('.')}": it names no single place to write at.`);
  }
  if (!isRecord(item)) {
    throw new Error(`Cannot mark an item with a sentinel at "${sentinel.path.join('.')}": the item is not a mapping.`);
  }
  return writeAtPath(item, sentinel.path, sentinel.value);
}

// region | Helpers

/**
 * Reports whether the sentinel's value stands anywhere `path` reaches into `value`.
 *
 * A wildcard segment branches over an array's elements and claims the item when any one of them has the mark,
 * which is how a mark buried in a list of commands is found without the declaration naming a position.
 */
function findsMark(value: unknown, path: ReadonlyArray<string>, sentinel: Sentinel): boolean {
  const [key, ...rest] = path;
  if (key === undefined) {
    return matchesValue(value, sentinel);
  }
  if (key === WILDCARD_SEGMENT) {
    return Array.isArray(value) && value.some((element: unknown) => findsMark(element, rest, sentinel));
  }
  return isRecord(value) && findsMark(value[key], rest, sentinel);
}

/** True for a plain object, the only shape a sentinel path can descend through. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reports whether a value at the end of a sentinel path is the mark.
 *
 * A containment match is what reaches a mark embedded in a larger string, such as a flag inside a command line, and it
 * reads only a string: a mark cannot be embedded in anything else.
 */
function matchesValue(value: unknown, sentinel: Sentinel): boolean {
  if (sentinel.match === 'contains') {
    return typeof value === 'string' && value.includes(sentinel.value);
  }
  return value === sentinel.value;
}

/** Returns a copy of `target` with `value` at `path`, creating the mappings the path descends through. */
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
