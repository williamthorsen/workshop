import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { hashBytes } from '../verify/targetHash.ts';
import { VERSION } from '../version.ts';
import { pickJsonPlugin } from './pickJsonPlugin.ts';

/** Result of a successful compilation. */
export interface CompileResult {
  outputPath: string;
  changed: boolean;
  targetHash: string;
}

/**
 * Generated-file header prepended to compiled output.
 *
 * Includes an exported `__readyupVersion` constant so the runner can detect skew between the
 * readyup version a kit was compiled against and the runner's own version at execution time.
 */
const GENERATED_HEADER = [
  '/** @noformat — @generated. Do not edit. Compiled by rdy. */',
  '/* eslint-disable */',
  `export const __readyupVersion = ${JSON.stringify(VERSION)};`,
  '',
].join('\n');

/** Derive the default output path by replacing the `.ts` extension with `.js`. */
function deriveOutputPath(inputPath: string): string {
  const ext = path.extname(inputPath);
  if (ext === '.ts' || ext === '.mts' || ext === '.cts') {
    return inputPath.slice(0, -ext.length) + '.js';
  }
  return `${inputPath}.js`;
}

/**
 * Bundle a TypeScript checklist file into a self-contained ESM bundle using esbuild.
 *
 * Node built-in modules and the `readyup` package (including `readyup/*` subpaths) are
 * kept external; all other imports are inlined. The externalized `readyup` specifiers
 * are resolved at runtime by the `rdy` runner's module-resolution hook
 * (`readyupResolverHook.ts`), which routes them to the runner's own readyup
 * installation. Prepends a generated-file header comment to the output.
 */
export async function compileConfig(inputPath: string, outputPath?: string): Promise<CompileResult> {
  const resolvedInput = path.resolve(inputPath);
  const resolvedOutput = path.resolve(outputPath ?? deriveOutputPath(inputPath));

  let esbuild: typeof import('esbuild');
  try {
    esbuild = await import('esbuild');
  } catch (error: unknown) {
    throw new Error(
      'esbuild is required for the compile command but is not installed. Install it with: pnpm add --save-dev esbuild',
      { cause: error },
    );
  }

  const result = await esbuild.build({
    entryPoints: [resolvedInput],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    external: ['node:*', 'readyup', 'readyup/*'],
    plugins: [pickJsonPlugin()],
    banner: { js: GENERATED_HEADER },
    write: false,
  });

  const outputFile = result.outputFiles[0];
  if (outputFile === undefined) {
    throw new Error(`esbuild produced no output for ${resolvedInput}`);
  }

  const compiled = Buffer.from(outputFile.contents);
  const existing = existsSync(resolvedOutput) ? readFileSync(resolvedOutput) : undefined;
  const changed = existing === undefined || !compiled.equals(existing);

  if (changed) {
    mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    writeFileSync(resolvedOutput, compiled);
  }

  return { outputPath: resolvedOutput, changed, targetHash: hashBytes(compiled) };
}
