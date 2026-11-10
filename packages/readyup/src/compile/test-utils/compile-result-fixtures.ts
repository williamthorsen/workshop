import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { hashBytes } from '../../verify/targetHash.ts';
import type { CompileResult } from '../compileConfig.ts';
import type { KitMetadata } from '../validateCompiledOutput.ts';

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

/** The bundle that `buildCompileResult` writes for every source. */
export const COMPILED = 'export default {};';

/** The esbuild version reported by every mocked compile, and the source of an entry's `esbuildVersion`. */
export const ESBUILD_VERSION = '0.99.0-test';

/** Returns the hash that the manifest records for a bundle with these contents. */
export function hashOf(contents: string): string {
  return hashBytes(Buffer.from(contents, 'utf8'));
}

/** Returns metadata as validating a compiled kit yields it, defaulting to a kit with no checklists to record. */
export function kitMetadata(overrides: Partial<KitMetadata> = {}): KitMetadata {
  return { checklistChecks: [], checklists: [], ...overrides };
}

/** The hash recorded by a compile for its entry point, and the source of a manifest entry's `sourceHash`. */
export const SOURCE_HASH = '5c0e1234';
