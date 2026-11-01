import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** The outcome of resolving a demo argument: the demo's absolute directory, or the names that exist. */
export type DemoDirResolution = { found: true; demoDir: string } | { found: false; demoNames: string[] };

/** Lists the sorted names of the directories under `demosRoot` that contain a storyboard. */
export function listDemoNames(demosRoot: string): string[] {
  if (!existsSync(demosRoot)) return [];

  return readdirSync(demosRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(path.join(demosRoot, name, 'generated', 'storyboard.json')))
    .toSorted();
}

/**
 * Resolves a demo named as `<name>`, `<demosDir>/<name>`, or `./<demosDir>/<name>`, each with or without a trailing
 * slash, where `demosDir` is relative to `root`.
 */
export function resolveDemoDir(root: string, demosDir: string, argument: string): DemoDirResolution {
  const demosRoot = path.join(root, demosDir);
  const demoNames = listDemoNames(demosRoot);
  const name = extractDemoName(argument, demosDir);
  if (name !== undefined && demoNames.includes(name)) {
    return { found: true, demoDir: path.join(demosRoot, name) };
  }

  return { found: false, demoNames };
}

// region | Helpers

/** Returns the name that an accepted argument form contains, or `undefined` for any other form. */
function extractDemoName(argument: string, demosDir: string): string | undefined {
  const segments = splitSegments(argument);
  if (segments.length === 1) return segments[0];

  const prefix = splitSegments(demosDir);
  const isUnderDemosDir =
    segments.length === prefix.length + 1 && prefix.every((segment, index) => segments[index] === segment);

  return isUnderDemosDir ? segments.at(-1) : undefined;
}

/** Splits a `/`-separated path into its segments, dropping empty and `.` segments. */
function splitSegments(value: string): string[] {
  return value.split('/').filter((segment) => segment !== '' && segment !== '.');
}

// endregion | Helpers
