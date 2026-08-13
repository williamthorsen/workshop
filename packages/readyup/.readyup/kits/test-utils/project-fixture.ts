import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { JsonPathSpec } from '../../../src/compile/extractJsonPaths.ts';
import { projectJsonFile } from '../../../src/compile/projectJsonFile.ts';
import { hashFile, hashProjection } from '../../../src/verify/targetHash.ts';

/** Path a fixture kit's inlined module is recorded at, relative to the manifest's own directory. */
export const FIXTURE_INLINED_MODULE_PATH = path.join('kits', 'checks', 'helper.ts');

/** Kit directory a fixture project holds, relative to its root. */
export const FIXTURE_KITS_DIR = path.join('.readyup', 'kits');

/** Manifest path a fixture project holds, relative to its root. */
export const FIXTURE_MANIFEST_PATH = path.join('.readyup', 'manifest.json');

/** A manifest kit entry, as `rdy compile` records one. */
export interface FixtureManifestEntry {
  inputs: FixtureManifestInput[];
  name: string;
  path: string;
  source: string;
  sourceHash: string;
  targetHash: string;
}

/** A recorded input, as `rdy compile` writes one. */
export interface FixtureManifestInput {
  hash: string;
  kind: 'inline' | 'module';
  path: string;
  paths?: JsonPathSpec;
}

/** Text of a bundle importing nothing beyond what the runner supplies. */
export const SELF_CONTAINED_BUNDLE = [
  'import { fileExists } from "readyup/check-utils";',
  'export default { checklists: [{ name: "demo", checks: [{ name: "ok", check: () => fileExists(".") }] }] };',
  '',
].join('\n');

/** Adds recorded inputs to a fixture entry, beside the entry module `writeKit` already records. */
export function withInputs(entry: FixtureManifestEntry, ...inputs: FixtureManifestInput[]): FixtureManifestEntry {
  return { ...entry, inputs: [...entry.inputs, ...inputs] };
}

/**
 * Writes a JSON file a compile would have projected, and returns the record of that projection.
 *
 * The projection and its hash come from the same helpers `rdy compile` records through, so a test says a
 * projection has moved by editing a picked field rather than by writing a hash of its own.
 */
export function writeInlineInput(
  projectRoot: string,
  recordedPath: string,
  data: Record<string, unknown>,
  paths: JsonPathSpec,
): FixtureManifestInput {
  const filePath = writeInputFile(projectRoot, recordedPath, `${JSON.stringify(data, undefined, 2)}\n`);
  return { hash: hashProjection(projectJsonFile(filePath, paths)), kind: 'inline', path: recordedPath, paths };
}

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

  const recordedSource = path.join('kits', `${name}.ts`);
  const sourceHash = hashFile(sourcePath);

  return {
    // A compile records the entry module in its closure and reads `sourceHash` back out of that record.
    inputs: [{ hash: sourceHash, kind: 'module', path: recordedSource }],
    name,
    path: path.join('kits', `${name}.js`),
    source: recordedSource,
    sourceHash,
    targetHash: hashFile(bundlePath),
  };
}

/** Writes the manifest recording the given entries, each of which may be edited to describe drift. */
export function writeKitManifest(projectRoot: string, entries: Array<Partial<FixtureManifestEntry>>): void {
  writeRawKitManifest(projectRoot, entries);
}

/** Writes a module a compile would have inlined, and returns the record of it. */
export function writeModuleInput(projectRoot: string, recordedPath: string, contents: string): FixtureManifestInput {
  const filePath = writeInputFile(projectRoot, recordedPath, contents);
  return { hash: hashFile(filePath), kind: 'module', path: recordedPath };
}

/** Writes the fixture project's manifest of record, which the publishing kit reads for its `files` list. */
export function writePackageJson(projectRoot: string, packageJson: Record<string, unknown>): void {
  writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'fixture', ...packageJson }));
}

/**
 * Writes the manifest recording the given kits exactly as given, records no schema would produce included.
 *
 * The door for a manifest a hand edit or a foreign tool wrote, which is what the kits' defensive narrowing
 * exists for and what a schema-typed entry cannot express.
 */
export function writeRawKitManifest(projectRoot: string, kits: Array<Record<string, unknown>>): void {
  const manifestPath = path.join(projectRoot, FIXTURE_MANIFEST_PATH);
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify({ version: 1, kits }));
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

/** Writes a file at a path the manifest would record, relative to the manifest's own directory. */
function writeInputFile(projectRoot: string, recordedPath: string, contents: string): string {
  const filePath = path.join(projectRoot, path.dirname(FIXTURE_MANIFEST_PATH), recordedPath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
  return filePath;
}

/** Overrides for the two files `writeKit` lays down. */
interface WriteKitOptions {
  bundle?: string | undefined;
  source?: string | undefined;
}

// endregion | Helpers
