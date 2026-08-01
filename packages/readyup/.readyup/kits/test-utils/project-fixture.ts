import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { hashFile } from '../../../src/verify/targetHash.ts';

/** Kit directory a fixture project holds, relative to its root. */
export const FIXTURE_KITS_DIR = path.join('.readyup', 'kits');

/** Manifest path a fixture project holds, relative to its root. */
export const FIXTURE_MANIFEST_PATH = path.join('.readyup', 'manifest.json');

/** A manifest kit entry, as `rdy compile` records one. */
export interface FixtureManifestEntry {
  name: string;
  path: string;
  source: string;
  sourceHash: string;
  targetHash: string;
}

/** Text of a bundle importing nothing beyond what the runner supplies. */
export const SELF_CONTAINED_BUNDLE = [
  'import { fileExists } from "readyup/check-utils";',
  'export default { checklists: [{ name: "demo", checks: [{ name: "ok", check: () => fileExists(".") }] }] };',
  '',
].join('\n');

/**
 * Writes a kit source and the bundle compiled from it, and returns the entry recording both.
 *
 * The hashes come from the same helper `rdy compile` uses, so a fixture written this way is fresh by
 * construction and a test asking about drift says so by editing the entry it gets back.
 */
export function writeKit(projectRoot: string, name: string, options: WriteKitOptions = {}): FixtureManifestEntry {
  const { bundle = SELF_CONTAINED_BUNDLE, source = DEFAULT_SOURCE } = options;
  const kitsDir = path.join(projectRoot, FIXTURE_KITS_DIR);
  mkdirSync(kitsDir, { recursive: true });

  const sourcePath = path.join(kitsDir, `${name}.ts`);
  const bundlePath = path.join(kitsDir, `${name}.js`);
  writeFileSync(sourcePath, source);
  writeFileSync(bundlePath, bundle);

  return {
    name,
    path: path.join('kits', `${name}.js`),
    source: path.join('kits', `${name}.ts`),
    sourceHash: hashFile(sourcePath),
    targetHash: hashFile(bundlePath),
  };
}

/** Writes the manifest recording the given entries, each of which may be edited to describe drift. */
export function writeKitManifest(projectRoot: string, entries: Array<Partial<FixtureManifestEntry>>): void {
  const manifestPath = path.join(projectRoot, FIXTURE_MANIFEST_PATH);
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify({ version: 1, kits: entries }));
}

/** Writes the fixture project's manifest of record, which the publishing kit reads for its `files` list. */
export function writePackageJson(projectRoot: string, packageJson: Record<string, unknown>): void {
  writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'fixture', ...packageJson }));
}

/** Writes a readyup config at the one path `loadConfig` looks in. */
export function writeRdyConfig(projectRoot: string): void {
  const configPath = path.join(projectRoot, '.config', 'readyup.config.ts');
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, `export default { compile: { include: '*.ts' } };\n`);
}

// region | Helpers

/** Kit source a fixture writes when a test does not care what the source says. */
const DEFAULT_SOURCE = [
  `import { defineRdyKit } from 'readyup';`,
  '',
  'export default defineRdyKit({ checklists: [] });',
  '',
].join('\n');

/** Overrides for the two files `writeKit` lays down. */
interface WriteKitOptions {
  bundle?: string | undefined;
  source?: string | undefined;
}

// endregion | Helpers
