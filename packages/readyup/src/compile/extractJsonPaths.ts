import assert from 'node:assert';

import { isRecord } from '../isRecord.ts';

/**
 * Extract selected paths from a parsed JSON object, preserving original nesting structure.
 *
 * Each path is either a single string (top-level key) or an array of strings (nested key path).
 * Throws if any requested path does not exist in the source object.
 */
export function extractJsonPaths(
  obj: Record<string, unknown>,
  paths: Array<string | Array<string>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const raw of paths) {
    const keys = typeof raw === 'string' ? [raw] : raw;
    if (keys.length === 0) continue;

    // Traverse the source object to verify the path exists.
    let current: unknown = obj;
    for (const key of keys) {
      if (!isRecord(current) || !(key in current)) {
        throw new Error(`Path not found in JSON: ${keys.join('.')}`);
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
