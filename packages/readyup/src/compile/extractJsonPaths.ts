import assert from 'node:assert';

import { isRecord } from '../portable/isRecord.ts';

/**
 * A `pickJson` path specifier list: a top-level key as a string, a nested one as an array of keys.
 *
 * Mirrors `pickJson`'s second argument, and is the form a recorded inline input carries so a later reader
 * can reproduce the projection the compile inlined.
 */
export type JsonPathSpec = Array<string | Array<string>>;

/** A key path a `pickJson` specifier named that the JSON object does not hold. */
export class JsonPathNotFoundError extends Error {
  /** The key path, dot-joined as `extractJsonPaths` walked it. */
  readonly keyPath: string;

  constructor(keyPath: string) {
    super(`Path not found in JSON: ${keyPath}`);
    this.name = 'JsonPathNotFoundError';
    this.keyPath = keyPath;
  }
}

/**
 * Extract selected paths from a parsed JSON object, preserving original nesting structure.
 *
 * Each path is either a single string (top-level key) or an array of strings (nested key path).
 * Throws if any requested path does not exist in the source object.
 */
export function extractJsonPaths(obj: Record<string, unknown>, paths: JsonPathSpec): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const raw of paths) {
    const keys = typeof raw === 'string' ? [raw] : raw;
    if (keys.length === 0) continue;

    // Traverse the source object to verify the path exists.
    let current: unknown = obj;
    for (const key of keys) {
      if (!isRecord(current) || !Object.hasOwn(current, key)) {
        throw new JsonPathNotFoundError(keys.join('.'));
      }
      current = current[key];
    }

    // Reconstruct the nested structure in the result.
    let target: Record<string, unknown> = result;
    for (let i = 0; i < keys.length - 1; i++) {
      const segment = keys[i];
      assert.ok(segment !== undefined);
      if (!isRecord(target[segment])) {
        target[segment] = {};
      }
      const next = target[segment];
      assert.ok(isRecord(next));
      target = next;
    }
    const lastKey = keys.at(-1);
    assert.ok(lastKey !== undefined);
    target[lastKey] = current;
  }

  return result;
}
