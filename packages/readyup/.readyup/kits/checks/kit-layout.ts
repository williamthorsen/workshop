import { readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { DEFAULT_MANIFEST_PATH } from 'readyup';
import { isRecord, readJsonFile } from 'readyup/check-utils';

// -- Paths --

/** Directory holding the manifest. Every path the manifest records is relative to it. */
export const MANIFEST_DIR = path.dirname(DEFAULT_MANIFEST_PATH);

/** Directory holding kit sources and the bundles compiled from them. */
export const KITS_DIR = path.join(MANIFEST_DIR, 'kits');

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

/** A manifest kit entry, narrowed to the fields these kits read. */
export interface ManifestEntry {
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

// region | Helpers

/** Narrows a value to a string, or `undefined` when it is anything else. */
function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Projects a raw manifest kit record onto the fields these kits read. */
function toManifestEntry(kit: Record<string, unknown>): ManifestEntry {
  return {
    name: asString(kit['name']) ?? '(unnamed)',
    path: asString(kit['path']),
    source: asString(kit['source']),
    sourceHash: asString(kit['sourceHash']),
    targetHash: asString(kit['targetHash']),
  };
}

// endregion | Helpers
