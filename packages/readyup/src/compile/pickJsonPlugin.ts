import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { Plugin } from 'esbuild';

import { isRecord } from '../isRecord.ts';
import { extractJsonPaths } from './extractJsonPaths.ts';

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
 * Parse the static arguments from a `pickJson(...)` call's argument string.
 *
 * Expects a JSON file path string and an array of path specifiers (strings or string arrays).
 * Only static literals are supported; expressions or template literals produce an error.
 */
function parsePickJsonArgs(argsText: string): { relativePath: string; paths: Array<string | Array<string>> } {
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
  const relativePath = match.groups.relPath;
  const rest = match.groups.rest;
  assert.ok(relativePath !== undefined);
  assert.ok(rest !== undefined);

  let parsed: unknown;
  try {
    // JSON.parse requires double quotes — replace single-quote delimiters only (not interior chars).
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

  const paths: Array<string | Array<string>> = [];
  for (const item of parsed) {
    if (typeof item === 'string') {
      paths.push(item);
    } else if (Array.isArray(item) && item.every((v) => typeof v === 'string')) {
      paths.push(item);
    } else {
      throw new Error(`Invalid path in pickJson paths array: ${JSON.stringify(item)}`);
    }
  }

  return { relativePath, paths };
}

/**
 * Create an esbuild plugin that replaces `pickJson(...)` calls with inlined object literals.
 *
 * The plugin intercepts TypeScript file loads, scans for `pickJson` calls, resolves
 * the referenced JSON file relative to the source file, extracts the requested paths,
 * and substitutes the call with a static object expression.
 */
export function pickJsonPlugin(): Plugin {
  return {
    name: 'pick-json',
    setup(build) {
      build.onLoad({ filter: /\.[cm]?ts$/ }, (args) => {
        let source: string;
        try {
          source = readFileSync(args.path, 'utf8');
        } catch {
          throw new Error(`pickJson: Cannot read source file "${args.path}"`);
        }

        // Fast bail: skip files that don't reference pickJson.
        if (!source.includes('pickJson')) return null;

        // Replace each pickJson(...) call with an inlined object literal.
        const replaced = source.replace(PICK_JSON_RE, (_fullMatch, argsText: string) => {
          const { relativePath, paths } = parsePickJsonArgs(argsText);
          const jsonFilePath = path.resolve(path.dirname(args.path), relativePath);

          let jsonContent: string;
          try {
            jsonContent = readFileSync(jsonFilePath, 'utf8');
          } catch {
            throw new Error(`pickJson: Cannot read JSON file "${relativePath}" (resolved to ${jsonFilePath})`);
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(jsonContent);
          } catch {
            throw new Error(`pickJson: Invalid JSON in "${relativePath}" (resolved to ${jsonFilePath})`);
          }

          if (!isRecord(parsed)) {
            throw new Error(`pickJson: Expected a JSON object in "${relativePath}", got ${typeof parsed}`);
          }

          const extracted = extractJsonPaths(parsed, paths);
          return JSON.stringify(extracted);
        });

        if (replaced === source) return null;

        return { contents: replaced, loader: 'ts' };
      });
    },
  };
}
