import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { hashBytes } from '../verify/targetHash.ts';
import { buildBundle, type InlinedJsonFile } from './buildBundle.ts';
import type { CompiledInput } from './CompiledInput.ts';
import { deriveJsPath } from './deriveJsPath.ts';
import { type KitMetadata, validateCompiledOutput } from './validateCompiledOutput.ts';

/** Result of a successful compilation. */
export interface CompileResult {
  /** Every package inlined by the bundle, by name, with the version that its `package.json` declares. */
  bundledDependencies: Record<string, string>;

  changed: boolean;

  /** The esbuild that produced the bundle. */
  esbuildVersion: string;

  /** Every JSON file that the bundle includes from outside `node_modules`. */
  inlinedJson: InlinedJsonFile[];

  /** Every file read by the compile outside `node_modules`, with absolute paths. */
  inputs: CompiledInput[];

  /** What validating the bundle as a kit yielded. */
  metadata: KitMetadata;

  outputPath: string;
  targetHash: string;
}

/**
 * Bundles a TypeScript kit file, validates the bundle as a kit, and writes it to disk.
 *
 * The bundle itself is `buildBundle`'s; this adds the destination. The bundle is staged beside the destination and
 * validated there, and replaces the destination only once validation passes, so a failed compile leaves the previous
 * bundle in place. The destination is left alone when its bytes already match, so a compile that changes nothing
 * leaves the file's mtime alone.
 */
export async function compileConfig(inputPath: string, outputPath?: string): Promise<CompileResult> {
  const resolvedOutput = path.resolve(outputPath ?? deriveJsPath(inputPath));

  const { bundledDependencies, bytes, esbuildVersion, inlinedJson, inputs } = await buildBundle(inputPath);
  const existing = existsSync(resolvedOutput) ? readFileSync(resolvedOutput) : undefined;
  const changed = existing === undefined || !bytes.equals(existing);

  // Stage in the destination's directory, so that the rename stays on one filesystem and is atomic.
  const stagedPath = deriveStagedPath(resolvedOutput);
  mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  writeFileSync(stagedPath, bytes);
  let metadata: KitMetadata;
  try {
    metadata = await validateCompiledOutput(stagedPath, resolvedOutput);
    if (changed) renameSync(stagedPath, resolvedOutput);
  } finally {
    rmSync(stagedPath, { force: true });
  }

  return {
    bundledDependencies,
    changed,
    esbuildVersion,
    inlinedJson,
    inputs,
    metadata,
    outputPath: resolvedOutput,
    targetHash: hashBytes(bytes),
  };
}

// region | Helpers

/**
 * Returns the path at which a bundle is staged for validation: a hidden sibling of the destination, unique to the
 * process, that keeps the `.js` extension so that the bundle loads as it will at its destination.
 */
function deriveStagedPath(outputPath: string): string {
  return path.join(path.dirname(outputPath), `.${path.basename(outputPath, '.js')}.${process.pid}.tmp.js`);
}

// endregion | Helpers
