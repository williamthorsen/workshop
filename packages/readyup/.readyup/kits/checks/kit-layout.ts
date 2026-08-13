import { readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { DEFAULT_MANIFEST_PATH } from 'readyup';
import type { SkipResult } from 'readyup';
import type { JsonPathSpec } from 'readyup/check-utils';
import { fileExists, isRecord, readJsonFile } from 'readyup/check-utils';

// -- Paths --

/** Directory holding the manifest. Every path the manifest records is relative to it. */
export const MANIFEST_DIR = path.dirname(DEFAULT_MANIFEST_PATH);

/** Directory holding kit sources and the bundles compiled from them. */
export const KITS_DIR = path.join(MANIFEST_DIR, 'kits');

// -- Skip reasons --

/** Detail reported by a check that stands down for want of a compiled bundle. */
export const NO_BUNDLES_REASON = 'There are no compiled kits';

/**
 * Paths of the compiled bundles in the kit directory, relative to the working directory.
 *
 * An absent or unreadable kit directory reads as holding none, which is what lets a check distinguish
 * a project that compiles nothing from one whose bundles have gone missing.
 */
export function listCompiledBundlePaths(): string[] {
  let entries;
  try {
    entries = readdirSync(path.join(process.cwd(), KITS_DIR), { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.join(KITS_DIR, entry.name))
    .toSorted();
}

/**
 * One file a kit's compile read, narrowed to the fields these kits read.
 *
 * Every field may be absent, because the record comes out of raw JSON rather than the manifest schema: a
 * kit reporting on a manifest cannot fail to load over the manifest it is reporting on. Only an inline
 * record carries `paths`, which is the specifier that produced the projection whose hash it holds.
 */
export interface ManifestInput {
  hash: string | undefined;
  kind: 'inline' | 'module' | undefined;
  path: string | undefined;
  paths: JsonPathSpec | undefined;
}

/**
 * A manifest kit entry, narrowed to the fields these kits read.
 *
 * `inputs` is absent on an entry compiled before readyup recorded the closure, which is why it is
 * narrowed to `undefined` rather than to an empty list: recording nothing and recording no closure at
 * all are different claims about a kit.
 */
export interface ManifestEntry {
  inputs: ManifestInput[] | undefined;
  name: string;
  path: string | undefined;
  source: string | undefined;
  sourceHash: string | undefined;
  targetHash: string | undefined;
}

/**
 * Kit entries the manifest records.
 *
 * A manifest that is absent, unparseable, or missing its `kits` array reads as recording none: these
 * kits report on what the project has, and cannot themselves fail to load over what they are checking.
 */
export function readManifestEntries(): ManifestEntry[] {
  const manifest = readJsonFile(DEFAULT_MANIFEST_PATH);
  if (manifest === undefined) return [];

  const kits = manifest['kits'];
  if (!Array.isArray(kits)) return [];

  return kits.filter(isRecord).map(toManifestEntry);
}

/** Path to a file the manifest names, relative to the working directory. */
export function resolveRecordedPath(recordedPath: string): string {
  return path.join(MANIFEST_DIR, recordedPath);
}

/** Skip reason for a check that has nothing to say until a bundle exists, or `false` once one does. */
export function skipWithoutBundles(): SkipResult {
  return listCompiledBundlePaths().length === 0 ? NO_BUNDLES_REASON : false;
}

/**
 * Skip reason for a check about a project that defines no kits, or `false` for one that does.
 *
 * A project defining none is outside these kits' subject rather than failing them: a monorepo root
 * that lists `packages` authors no kits of its own, and no consumer is expected to keep them at its
 * root. The manifest arm admits a project compiling to a non-default `outDir`, whose recorded kits
 * are still worth checking.
 */
export function skipWithoutKits(): SkipResult {
  return fileExists(KITS_DIR) || fileExists(DEFAULT_MANIFEST_PATH) ? false : 'This project defines no kits';
}

// region | Helpers

/**
 * Narrows a value to a `pickJson` path specifier, or `undefined` when it is anything else.
 *
 * A specifier holding anything but a key or a key path is rejected whole rather than in part, since a
 * projection taken over some of the paths recorded is not the projection whose hash was recorded.
 */
function asJsonPathSpec(value: unknown): JsonPathSpec | undefined {
  if (!Array.isArray(value)) return undefined;

  const spec: JsonPathSpec = [];
  for (const item of value) {
    if (typeof item !== 'string' && !isStringArray(item)) return undefined;
    spec.push(item);
  }

  return spec;
}

/** Narrows a value to a string, or `undefined` when it is anything else. */
function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Narrows a value to the nested-key form a path specifier may take. */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Projects a raw manifest kit record onto the fields these kits read. */
function toManifestEntry(kit: Record<string, unknown>): ManifestEntry {
  return {
    inputs: toManifestInputs(kit['inputs']),
    name: asString(kit['name']) ?? '(unnamed)',
    path: asString(kit['path']),
    source: asString(kit['source']),
    sourceHash: asString(kit['sourceHash']),
    targetHash: asString(kit['targetHash']),
  };
}

/** Projects a raw recorded input onto the fields these kits read. */
function toManifestInput(input: Record<string, unknown>): ManifestInput {
  const kind = input['kind'];
  return {
    hash: asString(input['hash']),
    kind: kind === 'inline' || kind === 'module' ? kind : undefined,
    path: asString(input['path']),
    paths: asJsonPathSpec(input['paths']),
  };
}

/** Projects a raw entry's recorded closure, or `undefined` when the entry records none. */
function toManifestInputs(value: unknown): ManifestInput[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isRecord).map(toManifestInput);
}

// endregion | Helpers
