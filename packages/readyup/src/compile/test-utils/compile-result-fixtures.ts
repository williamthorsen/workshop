import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { RdyManifestInput } from '../../manifest/manifestSchema.ts';
import { hashBytes } from '../../verify/targetHash.ts';
import type { CompileResult } from '../compileConfig.ts';
import type { KitMetadata } from '../validateCompiledOutput.ts';

/** Directory swept by the batch tests, matching the `srcDir` that the mocked config declares. */
export const SRC_DIR = '.readyup/kits';

/** The hash recorded by a compile for its entry point, and the source of a manifest entry's `sourceHash`. */
export const SOURCE_HASH = '5c0e1234';

/** The esbuild version reported by every mocked compile, and the source of an entry's `esbuildVersion`. */
export const ESBUILD_VERSION = '0.99.0-test';

/** The bundle that `buildCompileResult` writes for every source. */
export const COMPILED = 'export default {};';

/**
 * Stands in for `compileConfig` against a temp tree: Writes `COMPILED` to the output path, which defaults to the
 * source with a `.js` extension, and returns that bundle's real hash with the source's real path as its only input.
 */
export async function buildCompileResult(
  inputPath: string,
  outputPath: string = inputPath.replace(/\.ts$/, '.js'),
  overrides: Partial<Pick<CompileResult, 'changed' | 'metadata'>> & { sourceHash?: string } = {},
): Promise<CompileResult> {
  const { changed = true, metadata = kitMetadata(), sourceHash = SOURCE_HASH } = overrides;
  const absoluteOutputPath = path.resolve(outputPath);
  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await writeFile(absoluteOutputPath, COMPILED);

  return {
    bundledDependencies: {},
    changed,
    esbuildVersion: ESBUILD_VERSION,
    inlinedJson: [],
    inputs: [{ hash: sourceHash, kind: 'module', path: realpathSync(inputPath) }],
    metadata,
    outputPath: absoluteOutputPath,
    targetHash: hashOf(COMPILED),
  };
}

/** Returns the `inputs` that an entry has when its compile read only the entry point, stated against the manifest. */
export function buildRecordedEntry(relativePath: string): RdyManifestInput[] {
  return [{ hash: SOURCE_HASH, kind: 'module', path: relativePath }];
}

/**
 * Builds a `compileConfig` result whose closure records `entry` as the module from which the bundle was built.
 *
 * When a test cares which file supplied `sourceHash`, it says so by naming the entry, because the command
 * reads the hash back out of the closure rather than hashing the source itself.
 */
export function compileResult(
  entry: string,
  result: { outputPath: string; changed: boolean; targetHash: string; metadata?: KitMetadata | undefined },
  hash: string = SOURCE_HASH,
): CompileResult {
  const { metadata = kitMetadata(), ...fields } = result;
  return {
    ...fields,
    metadata,
    bundledDependencies: {},
    esbuildVersion: ESBUILD_VERSION,
    inlinedJson: [],
    inputs: [{ hash, kind: 'module', path: path.resolve(entry) }],
  };
}

/** Returns the hash that the manifest records for a bundle with these contents. */
export function hashOf(contents: string): string {
  return hashBytes(Buffer.from(contents, 'utf8'));
}

/** Returns metadata as validating a compiled kit yields it, defaulting to a kit with no checklists to record. */
export function kitMetadata(overrides: Partial<KitMetadata> = {}): KitMetadata {
  return { checklistChecks: [], checklists: [], ...overrides };
}

/** Returns the absolute path of a kit source in the directory that a batch compile sweeps. */
export function kitSource(fileName: string): string {
  return path.resolve(process.cwd(), SRC_DIR, fileName);
}
