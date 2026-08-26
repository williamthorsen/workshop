import type { CheckOutcome } from '../kits/types.ts';
import { isRecord } from '../portable/isRecord.ts';
import { safeJsonParse } from '../portable/safeJsonParse.ts';
import { readFile } from './filesystem.ts';
import { getJsonValue } from './json-value.ts';
import { missingFrom } from './missingFrom.ts';

/** Reads and parses a JSON file. Returns `undefined` if it doesn't exist or isn't an object. */
export function readJsonFile(filePath: string): Record<string, unknown> | undefined {
  const content = readFile(filePath);
  if (content === undefined) return undefined;
  const parsed = safeJsonParse(content);
  if (!isRecord(parsed)) return undefined;
  return parsed;
}

/** Checks whether a JSON file has a field, optionally with a specific value. */
export function hasJsonField(filePath: string, field: string, expectedValue?: string): boolean {
  const data = readJsonFile(filePath);
  if (data === undefined || !Object.hasOwn(data, field)) return false;
  return expectedValue === undefined || data[field] === expectedValue;
}

/** Reads a JSON file and extracts a nested value by traversing the key path. */
export function readJsonValue(filePath: string, ...keys: string[]): unknown {
  const obj = readJsonFile(filePath);
  if (obj === undefined) return undefined;
  return getJsonValue(obj, ...keys);
}

/** Checks whether a JSON file has all of the specified fields. */
export function hasJsonFields(filePath: string, fields: string[]): CheckOutcome {
  const data = readJsonFile(filePath) ?? {};
  const presentFields = fields.filter((field) => Object.hasOwn(data, field));
  return missingFrom('fields', fields, presentFields);
}
