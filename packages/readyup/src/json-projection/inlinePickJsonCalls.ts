import assert from 'node:assert';
import path from 'node:path';

import type { JsonPathSpec } from './extractJsonPaths.ts';
import { JsonProjectionError } from './JsonProjectionError.ts';

/** Reads a JSON file and returns the projection of `paths` out of it, serialized as an object literal. */
export type ReadJsonProjection = (filePath: string, paths: JsonPathSpec) => string;

/**
 * Regex that matches a `pickJson(...)` call expression in source text.
 *
 * Limitations of regex-based matching:
 * - Matches call syntax anywhere in source, including inside comments and string literals.
 *   A commented-out call like `// pickJson('./pkg.json', ['name'])` will be processed.
 *   This fails loudly (file-not-found or unexpected rewrite) rather than silently.
 * - `[^)]+` cannot handle file paths or key names containing `)`.
 */
const PICK_JSON_RE = /\bpickJson\s*\((?<args>[^)]+)\)/g;

/**
 * Returns `source` with every `pickJson(...)` call replaced by the object literal to which it resolves.
 *
 * Each call's JSON path resolves relative to `filePath`, the module containing the call, and `readProjection`
 * reads the file. Returns `source` unchanged when it does not contain a call.
 */
export function inlinePickJsonCalls(source: string, filePath: string, readProjection: ReadJsonProjection): string {
  // Fast bail: Skip files that don't reference pickJson.
  if (!source.includes('pickJson')) return source;

  return source.replace(PICK_JSON_RE, (_fullMatch, argsText: string) => {
    const { relativePath, paths } = parsePickJsonArgs(argsText);
    const jsonFilePath = path.resolve(path.dirname(filePath), relativePath);

    try {
      return readProjection(jsonFilePath, paths);
    } catch (error: unknown) {
      throw describeProjectionFailure(error, relativePath, jsonFilePath);
    }
  });
}

// region | Helpers

/**
 * Returns the failure to raise for a projection that did not complete, worded as `pickJson` reports it.
 *
 * Names the path as the kit wrote it, which the projection cannot: By the time it reads the file, only
 * the resolved path is available.
 */
function describeProjectionFailure(error: unknown, relativePath: string, jsonFilePath: string): unknown {
  if (!(error instanceof JsonProjectionError)) return error;

  switch (error.reason) {
    case 'invalid-json':
      return new Error(`pickJson: Invalid JSON in "${relativePath}" (resolved to ${jsonFilePath})`, { cause: error });
    case 'not-an-object':
      return new Error(`pickJson: Expected a JSON object in "${relativePath}", got ${error.detail}`, { cause: error });
    case 'path-not-found':
      return error;
    case 'unreadable':
      return new Error(`pickJson: Cannot read JSON file "${relativePath}" (resolved to ${jsonFilePath})`, {
        cause: error,
      });
  }
}

/** Narrows a parsed JSON value to the nested-path form that a path specifier may take. */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Returns the static arguments in a `pickJson(...)` call's argument string.
 *
 * Expects a JSON file path string and an array of path specifiers, each a string or an array of
 * strings. Only a static literal is supported; an expression or a template literal is an error.
 */
function parsePickJsonArgs(argsText: string): { relativePath: string; paths: JsonPathSpec } {
  // Trim and strip potential trailing comma.
  const trimmed = argsText.trim().replace(/,\s*$/, '');

  // Split on the boundary between the first string argument and the array argument.
  // Match: "path" or 'path', then a comma, then the rest starting with [.
  const match = /^(?<q>["'])(?<relPath>.+?)\k<q>\s*,\s*(?<rest>\[[\s\S]*\])$/.exec(trimmed);
  if (!match) {
    throw new Error(
      `Cannot parse pickJson arguments. Only static string and array literals are supported. Got: pickJson(${argsText})`,
    );
  }

  assert.ok(match.groups);
  const { relPath: relativePath, rest } = match.groups;
  assert.ok(relativePath !== undefined);
  assert.ok(rest !== undefined);

  let parsed: unknown;
  try {
    // JSON.parse requires double quotes -- replace single-quote delimiters only (not interior chars).
    // Path keys must be plain identifiers (no embedded quotes or special characters).
    const jsonText = rest.replace(/'([^']*?)'/g, '"$1"');
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(
      `Cannot parse pickJson paths array. Only static string and array literals are supported. Got: ${rest}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new TypeError(`pickJson paths argument must be an array. Got: ${rest}`);
  }

  const paths: JsonPathSpec = [];
  for (const item of parsed) {
    if (typeof item !== 'string' && !isStringArray(item)) {
      throw new Error(`Invalid path in pickJson paths array: ${JSON.stringify(item)}`);
    }
    paths.push(item);
  }

  return { relativePath, paths };
}

// endregion | Helpers
