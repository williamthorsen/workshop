import { isRecord } from '../isRecord.ts';

/** Extract a nested value from a parsed object by traversing the key path. */
export function getJsonValue(obj: Record<string, unknown>, ...keys: string[]): unknown {
  let current: unknown = obj;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

/** Check whether a non-nullish value exists at the key path in a parsed object. */
export function hasJsonValue(obj: Record<string, unknown>, ...keys: string[]): boolean {
  const value = getJsonValue(obj, ...keys);
  return value !== undefined && value !== null;
}
