import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { hashBytes } from '../verify/targetHash.ts';
import { buildBundle } from './buildBundle.ts';

/** Result of a successful compilation. */
export interface CompileResult {
  outputPath: string;
  changed: boolean;
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
  const resolvedOutput = path.resolve(outputPath ?? deriveOutputPath(inputPath));

  const compiled = await buildBundle(inputPath);
  const existing = existsSync(resolvedOutput) ? readFileSync(resolvedOutput) : undefined;
  const changed = existing === undefined || !compiled.equals(existing);

  if (changed) {
    mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    writeFileSync(resolvedOutput, compiled);
  }

  return { outputPath: resolvedOutput, changed, targetHash: hashBytes(compiled) };
}

/** Derives the default output path by replacing the `.ts` extension with `.js`. */
function deriveOutputPath(inputPath: string): string {
  const ext = path.extname(inputPath);
  if (ext === '.ts' || ext === '.mts' || ext === '.cts') {
    return inputPath.slice(0, -ext.length) + '.js';
  }
  return `${inputPath}.js`;
}
