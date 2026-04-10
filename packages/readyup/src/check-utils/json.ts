import { isRecord } from '../isRecord.ts';
import type { CheckOutcome } from '../types.ts';
import { readFile } from './filesystem.ts';
import { missingFrom } from './missingFrom.ts';

/** Read and parse a JSON file relative to cwd. Return undefined if it doesn't exist or isn't an object. */
export function readJsonFile(relativePath: string): Record<string, unknown> | undefined {
  const content = readFile(relativePath);
  if (content === undefined) return undefined;
  const parsed: unknown = JSON.parse(content);
  if (!isRecord(parsed)) return undefined;
  return Object.fromEntries(Object.entries(parsed));
}

/** Check whether a JSON file has a field, optionally with a specific value. */
export function hasJsonField(relativePath: string, field: string, expectedValue?: string): boolean {
  const data = readJsonFile(relativePath);
  if (data === undefined) return false;
  if (expectedValue !== undefined) return data[field] === expectedValue;
  return field in data;
}

/** Check whether a JSON file has all of the specified fields. */
export function hasJsonFields(relativePath: string, fields: string[]): CheckOutcome {
  const data = readJsonFile(relativePath);
  if (data === undefined) {
    return missingFrom('fields', fields, []);
  }
  const presentFields = fields.filter((field) => field in data);
  return missingFrom('fields', fields, presentFields);
}
