import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import picomatch from 'picomatch';

import { loadConfig } from '../loadConfig.ts';
import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestSchema.ts';
import { ManifestNotFoundError, readManifest } from '../manifest/readManifest.ts';
import { writeManifest } from '../manifest/writeManifest.ts';
import { parseArgs, translateParseError } from '../parseArgs.ts';
import { ICON_SKIPPED_NA as ICON_NO_CHANGES } from '../reportRdy.ts';
import { extractMessage } from '../utils/error-handling.ts';
import { compileConfig } from './compileConfig.ts';
import { hashSourceFile } from './hashSourceFile.ts';
import type { KitMetadata } from './validateCompiledOutput.ts';
import { validateCompiledOutput } from './validateCompiledOutput.ts';

const compileFlagSchema = {
  manifest: { long: '--manifest', type: 'string' as const },
  output: { long: '--output', type: 'string' as const, short: '-o' },
  skipManifest: { long: '--skip-manifest', type: 'boolean' as const },
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
    const message = extractMessage(error);
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
  const skipManifest = parsed.flags.skipManifest;
  const manifestPath = resolveManifestPath(parsed.flags.manifest);

  if (positionals.length > 1) {
    process.stderr.write('Error: Too many arguments. Expected a single input file.\n');
    return 1;
  }

  const inputPath = positionals[0];

  // Explicit input file -- compile just that one
  if (inputPath !== undefined) {
    let result;
    let metadata: KitMetadata;
    try {
      result = await compileConfig(inputPath, outputPath);
      metadata = await validateCompiledOutput(result.outputPath);
    } catch (error: unknown) {
      const message = extractMessage(error);
      process.stderr.write(`Error: ${message}\n`);
      return 1;
    }

    const relInput = path.relative(process.cwd(), path.resolve(inputPath));
    const relOutput = path.relative(process.cwd(), result.outputPath);
    process.stdout.write('Compiling kit:\n');
    process.stdout.write(formatResultLine(relInput, relOutput, result.changed));

    if (!skipManifest) {
      try {
        const kitName = path.basename(result.outputPath, '.js');
        const manifestDir = path.dirname(manifestPath);
        const relOutputPath = path.relative(manifestDir, path.resolve(result.outputPath));
        const relSourcePath = path.relative(manifestDir, path.resolve(inputPath));
        const sourceHash = hashSourceFile(path.resolve(inputPath));
        upsertManifest(manifestPath, kitName, metadata, {
          path: relOutputPath,
          source: relSourcePath,
          sourceHash,
        });
      } catch (error: unknown) {
        const message = extractMessage(error);
        process.stderr.write(`Error writing manifest: ${message}\n`);
        return 1;
      }
    }

    return 0;
  }

  // No input file -- compile all sources from config
  if (outputPath !== undefined) {
    process.stderr.write('Error: --output requires an input file\n');
    return 1;
  }

  return compileBatch(skipManifest, manifestPath);
}

/** Resolve the manifest output path from the optional `--manifest` flag. */
function resolveManifestPath(flagValue: string | undefined): string {
  return path.resolve(process.cwd(), flagValue ?? DEFAULT_MANIFEST_PATH);
}

/** Collect `.ts` files matching the optional `include` glob, falling back to all `.ts` files. */
function collectSourceFiles(srcDir: string, includeGlob: string | undefined): string[] {
  const entries = readdirSync(srcDir, { recursive: true, encoding: 'utf8' });
  const isMatch = includeGlob !== undefined ? picomatch(includeGlob) : undefined;
  // eslint-disable-next-line unicorn/no-array-sort -- filter() returns a new array; toSorted() requires es2023 lib
  return entries.filter((name) => name.endsWith('.ts') && (isMatch === undefined || isMatch(name))).sort();
}

/** Compile all matching `.ts` files from the config-driven source directory. */
async function compileBatch(skipManifest: boolean, manifestPath: string): Promise<number> {
  let config;
  try {
    config = await loadConfig();
  } catch (error: unknown) {
    const message = extractMessage(error);
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
    const message = extractMessage(error);
    process.stderr.write(`Error: Failed to read source directory: ${message}\n`);
    return 1;
  }

  if (tsFiles.length === 0) {
    const relSrc = path.relative(process.cwd(), srcDir);
    process.stdout.write(`No .ts files found in ${relSrc}\n`);
    if (!skipManifest) {
      try {
        writeManifest(manifestPath, { version: 1, kits: [] });
      } catch (error: unknown) {
        const message = extractMessage(error);
        process.stderr.write(`Error writing manifest: ${message}\n`);
        return 1;
      }
    }
    return 0;
  }

  const relSrcDir = path.relative(process.cwd(), srcDir);
  const relOutDir = path.relative(process.cwd(), outDir);
  const header =
    srcDir === outDir ? `Compiling kits in ${relSrcDir}:\n` : `Compiling kits from ${relSrcDir} to ${relOutDir}:\n`;
  process.stdout.write(header);

  const manifestDir = path.dirname(manifestPath);
  const kitEntries: RdyManifestKit[] = [];

  for (const fileName of tsFiles) {
    const srcFile = path.join(srcDir, fileName);
    const outFile = path.join(outDir, fileName.replace(/\.ts$/, '.js'));
    try {
      const result = await compileConfig(srcFile, outFile);
      const metadata = await validateCompiledOutput(result.outputPath);
      const outName = fileName.replace(/\.ts$/, '.js');
      process.stdout.write(formatResultLine(fileName, outName, result.changed));

      const kitName = path.basename(result.outputPath, '.js');
      const relOutputPath = path.relative(manifestDir, path.resolve(result.outputPath));
      const relSourcePath = path.relative(manifestDir, srcFile);
      const sourceHash = hashSourceFile(srcFile);
      kitEntries.push({
        name: kitName,
        path: relOutputPath,
        source: relSourcePath,
        sourceHash,
        ...(metadata.description !== undefined && { description: metadata.description }),
      });
    } catch (error: unknown) {
      const message = extractMessage(error);
      process.stderr.write(`Error compiling ${fileName}: ${message}\n`);
      return 1;
    }
  }

  if (!skipManifest) {
    try {
      kitEntries.sort((a, b) => a.name.localeCompare(b.name));
      writeManifest(manifestPath, { version: 1, kits: kitEntries });
    } catch (error: unknown) {
      const message = extractMessage(error);
      process.stderr.write(`Error writing manifest: ${message}\n`);
      return 1;
    }
  }

  return 0;
}

/** Location fields for a manifest kit entry. */
interface KitLocationFields {
  path: string;
  source: string;
  sourceHash: string;
}

/** Read an existing manifest (if any), upsert a kit entry, and write back. */
function upsertManifest(
  manifestPath: string,
  kitName: string,
  metadata: KitMetadata,
  location: KitLocationFields,
): void {
  let existingKits: RdyManifestKit[] = [];
  try {
    const existing = readManifest(manifestPath);
    existingKits = existing.kits;
  } catch (error: unknown) {
    // Missing manifest is expected for first compile; other failures should surface.
    if (!(error instanceof ManifestNotFoundError)) {
      const message = extractMessage(error);
      process.stderr.write(`Warning: ${message} — starting with empty manifest\n`);
    }
  }

  const entry: RdyManifestKit = {
    name: kitName,
    path: location.path,
    source: location.source,
    sourceHash: location.sourceHash,
    ...(metadata.description !== undefined && { description: metadata.description }),
  };

  // Replace existing entry for this kit name, or append.
  const filtered = existingKits.filter((k) => k.name !== kitName);
  // eslint-disable-next-line unicorn/no-array-sort -- toSorted() requires es2023 lib
  const kits = [...filtered, entry].sort((a, b) => a.name.localeCompare(b.name));

  writeManifest(manifestPath, { version: 1, kits });
}

/** Format a single compile-result line with a change indicator. */
function formatResultLine(srcName: string, outName: string, changed: boolean): string {
  return changed ? `  📦 ${srcName} → ${outName}\n` : `  ${ICON_NO_CHANGES} ${srcName} — no changes\n`;
}
