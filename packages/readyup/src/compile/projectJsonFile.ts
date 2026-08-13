import { readFileSync } from 'node:fs';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { describeType } from '../portable/describe-value.ts';
import { isRecord } from '../portable/isRecord.ts';
import type { JsonPathSpec } from './extractJsonPaths.ts';
import { extractJsonPaths } from './extractJsonPaths.ts';
import { JsonProjectionError } from './JsonProjectionError.ts';

/**
 * Reads a JSON file, projects `paths` out of it, and returns that projection serialized.
 *
 * The one implementation of the projection every reader of a recorded input decides by. Once a
 * projection's serialization is hashed it is a format, so a second implementation of it would drift and
 * the two would disagree about a file neither had changed.
 *
 * Returns the serialized form rather than the projected object, which is what makes the bytes a compile
 * hashes the bytes it substitutes.
 */
export function projectJsonFile(filePath: string, paths: JsonPathSpec): string {
  let contents: string;
  try {
    contents = readFileSync(filePath, 'utf8');
  } catch (error: unknown) {
    throw new JsonProjectionError('unreadable', filePath, `Cannot read JSON file ${filePath}`, { cause: error });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error: unknown) {
    throw new JsonProjectionError('invalid-json', filePath, `Invalid JSON in ${filePath}`, { cause: error });
  }

  if (!isRecord(parsed)) {
    const detail = describeType(parsed);
    throw new JsonProjectionError('not-an-object', filePath, `Expected a JSON object in ${filePath}, got ${detail}`, {
      detail,
    });
  }

  try {
    return JSON.stringify(extractJsonPaths(parsed, paths));
  } catch (error: unknown) {
    throw new JsonProjectionError('path-not-found', filePath, describeError(error), { cause: error });
  }
}
