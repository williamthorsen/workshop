import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import picomatch from 'picomatch';

import { loadConfig } from '../loadConfig.ts';
import { parseArgs, translateParseError } from '../parseArgs.ts';
import { compileConfig } from './compileConfig.ts';
import { validateCompiledOutput } from './validateCompiledOutput.ts';

const compileFlagSchema = {
  output: { long: '--output', type: 'string' as const, short: '-o' },
};

/**
 * Handle the `compile` subcommand: parse arguments, invoke the bundler, and report the result.
 *
 * Returns a numeric exit code.
 */
export async function compileCommand(args: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs(args, compileFlagSchema);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // Translate generic "requires a value" to domain hint.
    if (message === '--output requires a value') {
      process.stderr.write('Error: --output requires a path argument\n');
    } else {
      process.stderr.write(`Error: ${translateParseError(error)}\n`);
    }
    return 1;
  }

  const outputPath = parsed.flags.output;
  const positionals = parsed.positionals;

  if (positionals.length > 1) {
    process.stderr.write('Error: Too many arguments. Expected a single input file.\n');
    return 1;
  }

  const inputPath = positionals[0];

  // Explicit input file -- compile just that one
  if (inputPath !== undefined) {
    try {
      const result = await compileConfig(inputPath, outputPath);
      await validateCompiledOutput(result.outputPath);
      const relInput = path.relative(process.cwd(), path.resolve(inputPath));
      const relOutput = path.relative(process.cwd(), result.outputPath);
      process.stdout.write('Compiling kit:\n');
      process.stdout.write(formatResultLine(relInput, relOutput, result.changed));
      return 0;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Error: ${message}\n`);
      return 1;
    }
  }

  // No input file -- compile all sources from config
  if (outputPath !== undefined) {
    process.stderr.write('Error: --output requires an input file\n');
    return 1;
  }

  return compileBatch();
}

/** Collect `.ts` files matching the optional `include` glob, falling back to all `.ts` files. */
function collectSourceFiles(srcDir: string, includeGlob: string | undefined): string[] {
  const entries = readdirSync(srcDir, { recursive: true, encoding: 'utf8' });
  const isMatch = includeGlob !== undefined ? picomatch(includeGlob) : undefined;
  // eslint-disable-next-line unicorn/no-array-sort -- filter() returns a new array; toSorted() requires es2023 lib
  return entries.filter((name) => name.endsWith('.ts') && (isMatch === undefined || isMatch(name))).sort();
}

/** Compile all matching `.ts` files from the config-driven source directory. */
async function compileBatch(): Promise<number> {
  let config;
  try {
    config = await loadConfig();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }

  const srcDir = path.resolve(process.cwd(), config.compile.srcDir);
  const outDir = path.resolve(process.cwd(), config.compile.outDir);

  if (!existsSync(srcDir)) {
    process.stderr.write(`Error: Source directory not found: ${srcDir}\n`);
    return 1;
  }

  let tsFiles: string[];
  try {
    tsFiles = collectSourceFiles(srcDir, config.compile.include);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: Failed to read source directory: ${message}\n`);
    return 1;
  }

  if (tsFiles.length === 0) {
    process.stderr.write(`Error: No .ts files found in ${srcDir}\n`);
    return 1;
  }

  const relSrcDir = path.relative(process.cwd(), srcDir);
  const relOutDir = path.relative(process.cwd(), outDir);
  const header =
    srcDir === outDir ? `Compiling kits in ${relSrcDir}:\n` : `Compiling kits from ${relSrcDir} to ${relOutDir}:\n`;
  process.stdout.write(header);

  for (const fileName of tsFiles) {
    const srcFile = path.join(srcDir, fileName);
    const outFile = path.join(outDir, fileName.replace(/\.ts$/, '.js'));
    try {
      const result = await compileConfig(srcFile, outFile);
      await validateCompiledOutput(result.outputPath);
      const outName = fileName.replace(/\.ts$/, '.js');
      process.stdout.write(formatResultLine(fileName, outName, result.changed));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Error compiling ${fileName}: ${message}\n`);
      return 1;
    }
  }

  return 0;
}

/** Format a single compile-result line with a change indicator. */
function formatResultLine(srcName: string, outName: string, changed: boolean): string {
  return changed ? `  📦 ${srcName} → ${outName}\n` : `  ⚪ ${srcName} — no changes\n`;
}
