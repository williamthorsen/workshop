import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { hashBytes } from '../verify/targetHash.ts';
import { buildBundle } from './buildBundle.ts';
import type { CompiledInput } from './CompiledInput.ts';
import { deriveJsPath } from './deriveJsPath.ts';

/** Result of a successful compilation. */
export interface CompileResult {
  /** Every package the bundle inlined, by name, with the version its `package.json` declares. */
  bundledDependencies: Record<string, string>;

  changed: boolean;

  /** The esbuild that produced the bundle. */
  esbuildVersion: string;

  /** Every file the compile read outside `node_modules`, with absolute paths. */
  inputs: CompiledInput[];

  outputPath: string;
  targetHash: string;
}

/**
 * Bundles a TypeScript checklist file and writes the result to disk.
 *
 * The bundle itself is `buildBundle`'s; this adds the destination. Writing is skipped when the
 * bytes already on disk are identical, so a compile that changes nothing leaves the file's mtime
 * alone.
 */
export async function compileConfig(inputPath: string, outputPath?: string): Promise<CompileResult> {
  const resolvedOutput = path.resolve(outputPath ?? deriveJsPath(inputPath));

  const { bundledDependencies, bytes, esbuildVersion, inputs } = await buildBundle(inputPath);
  const existing = existsSync(resolvedOutput) ? readFileSync(resolvedOutput) : undefined;
  const changed = existing === undefined || !bytes.equals(existing);

  if (changed) {
    mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    writeFileSync(resolvedOutput, bytes);
  }

  return {
    bundledDependencies,
    changed,
    esbuildVersion,
    inputs,
    outputPath: resolvedOutput,
    targetHash: hashBytes(bytes),
  };
}
