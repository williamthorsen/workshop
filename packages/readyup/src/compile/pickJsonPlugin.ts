import assert from 'node:assert';
import path from 'node:path';

import type { Plugin } from 'esbuild';

import type { CompileRecorder } from './createCompileRecorder.ts';
import type { JsonPathSpec } from './extractJsonPaths.ts';
import { JsonProjectionError } from './JsonProjectionError.ts';

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
 * Returns an esbuild plugin that replaces `pickJson(...)` calls with inlined object literals.
 *
 * The plugin intercepts TypeScript file loads, scans for `pickJson` calls, resolves each referenced
 * JSON file relative to its source file, extracts the requested paths, and substitutes the call with
 * a static object expression.
 *
 * Every read goes through `recorder`, which is what puts the module and the JSON file it projected into
 * the compile's input closure. This module imports no filesystem API of its own, so a read it performs
 * cannot escape that closure.
 */
export function pickJsonPlugin(recorder: CompileRecorder): Plugin {
  return {
    name: 'pick-json',
    setup(build) {
      build.onLoad({ filter: /\.[cm]?ts$/ }, (args) => {
        let source: string;
        try {
          source = recorder.readModule(args.path);
        } catch {
          throw new Error(`pickJson: Cannot read source file "${args.path}"`);
        }

        // Fast bail: skip files that don't reference pickJson.
        if (!source.includes('pickJson')) return null;

        // Replace each pickJson(...) call with an inlined object literal.
        const replaced = source.replace(PICK_JSON_RE, (_fullMatch, argsText: string) => {
          const { relativePath, paths } = parsePickJsonArgs(argsText);
          const jsonFilePath = path.resolve(path.dirname(args.path), relativePath);

          try {
            return recorder.readProjection(jsonFilePath, paths);
          } catch (error: unknown) {
            throw describeProjectionFailure(error, relativePath, jsonFilePath);
          }
        });

        if (replaced === source) return null;

        return { contents: replaced, loader: 'ts' };
      });
    },
  };
}

// region | Helpers

/**
 * Returns the failure to raise for a projection that did not complete, worded as `pickJson` reports it.
 *
 * Names the path as the kit wrote it, which the projection cannot: by the time it reads the file, only
 * the resolved path survives.
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

/** Narrows a parsed JSON value to the nested-path form a path specifier may take. */
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
