import { isRecord } from '../portable/isRecord.ts';

/** Returns the value at a key path in a parsed object, traversing one key at a time. */
export function getJsonValue(obj: Record<string, unknown>, ...keys: string[]): unknown {
  let current: unknown = obj;
  for (const key of keys) {
    if (!isRecord(current) || !Object.hasOwn(current, key)) return undefined;
    current = current[key];
  }
  return current;
}

/** Reports whether a non-nullish value exists at a key path in a parsed object. */
export function hasJsonValue(obj: Record<string, unknown>, ...keys: string[]): boolean {
  const value = getJsonValue(obj, ...keys);
  return value !== undefined && value !== null;
}
