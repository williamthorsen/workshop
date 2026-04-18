import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import picomatch from 'picomatch';

import { loadConfig } from '../loadConfig.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { ManifestNotFoundError, readManifest } from '../manifest/readManifest.ts';
import { writeManifest } from '../manifest/writeManifest.ts';
import { parseArgs, translateParseError } from '../parseArgs.ts';
import { ICON_SKIPPED_NA as ICON_NO_CHANGES } from '../reportRdy.ts';
import { extractMessage } from '../utils/error-handling.ts';
import type { DriftStatus } from '../verify/checkDrift.ts';
import { checkDrift } from '../verify/checkDrift.ts';
import { compileConfig } from './compileConfig.ts';
import type { KitMetadata } from './validateCompiledOutput.ts';
import { validateCompiledOutput } from './validateCompiledOutput.ts';

const compileFlagSchema = {
  force: { long: '--force', type: 'boolean' as const },
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

  const force = parsed.flags.force;
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
    return compileSingle({ inputPath, outputPath, skipManifest, force, manifestPath });
  }

  // No input file -- compile all sources from config
  if (outputPath !== undefined) {
    process.stderr.write('Error: --output requires an input file\n');
    return 1;
  }

  return compileBatch({ skipManifest, force, manifestPath });
}

/** Arguments for the single-file compile path. */
interface CompileSingleArgs {
  inputPath: string;
  outputPath: string | undefined;
  skipManifest: boolean;
  force: boolean;
  manifestPath: string;
}

/** Compile a single explicit input file, applying the drift gate before overwriting. */
async function compileSingle(args: CompileSingleArgs): Promise<number> {
  const { inputPath, outputPath, skipManifest, force, manifestPath } = args;
  const manifestDir = path.dirname(manifestPath);

  const resolvedInputPath = path.resolve(inputPath);
  const resolvedOutputPath = path.resolve(outputPath ?? deriveJsPath(resolvedInputPath));
  const kitName = path.basename(resolvedOutputPath, '.js');

  process.stdout.write('Compiling kit:\n');

  const existingKit = skipManifest ? undefined : loadExistingKitsByName(manifestPath).get(kitName);
  const drift = detectDrift({ skipManifest, force, existingKit, manifestDir });
  if (drift !== undefined) {
    const relInput = path.relative(process.cwd(), resolvedInputPath);
    process.stdout.write(formatDriftLine(relInput, drift.status));
    process.stdout.write('\nRe-run with --force to overwrite, or move edits into the source.\n');
    return 1;
  }

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

  const relInput = path.relative(process.cwd(), resolvedInputPath);
  const relOutput = path.relative(process.cwd(), result.outputPath);
  process.stdout.write(formatResultLine(relInput, relOutput, result.changed));

  if (!skipManifest) {
    try {
      const relOutputPath = path.relative(manifestDir, path.resolve(result.outputPath));
      const relSourcePath = path.relative(manifestDir, resolvedInputPath);
      upsertManifest(manifestPath, kitName, metadata, {
        path: relOutputPath,
        source: relSourcePath,
        targetHash: result.targetHash,
      });
    } catch (error: unknown) {
      const message = extractMessage(error);
      process.stderr.write(`Error writing manifest: ${message}\n`);
      return 1;
    }
  }

  return 0;
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

/** Arguments for the batch compile path. */
interface CompileBatchArgs {
  skipManifest: boolean;
  force: boolean;
  manifestPath: string;
}

/** Compile all matching `.ts` files from the config-driven source directory. */
async function compileBatch(args: CompileBatchArgs): Promise<number> {
  const { skipManifest, force, manifestPath } = args;
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
  const existingKitsByName = skipManifest ? new Map<string, RdyManifestKit>() : loadExistingKitsByName(manifestPath);
  const kitEntries: RdyManifestKit[] = [];
  let skippedCount = 0;

  for (const fileName of tsFiles) {
    const srcFile = path.join(srcDir, fileName);
    const outFile = path.join(outDir, fileName.replace(/\.ts$/, '.js'));
    const kitName = path.basename(outFile, '.js');

    const drift = detectDrift({ skipManifest, force, existingKit: existingKitsByName.get(kitName), manifestDir });
    if (drift !== undefined) {
      process.stdout.write(formatDriftLine(fileName, drift.status));
      kitEntries.push(drift.existingKit);
      skippedCount += 1;
      continue;
    }

    try {
      const result = await compileConfig(srcFile, outFile);
      const metadata = await validateCompiledOutput(result.outputPath);
      const outName = fileName.replace(/\.ts$/, '.js');
      process.stdout.write(formatResultLine(fileName, outName, result.changed));

      const relOutputPath = path.relative(manifestDir, path.resolve(result.outputPath));
      const relSourcePath = path.relative(manifestDir, srcFile);
      kitEntries.push({
        name: kitName,
        path: relOutputPath,
        source: relSourcePath,
        targetHash: result.targetHash,
        ...(metadata.description !== undefined && { description: metadata.description }),
      });
    } catch (error: unknown) {
      const message = extractMessage(error);
      process.stderr.write(`Error compiling ${fileName}: ${message}\n`);
      return 1;
    }
  }

  if (skippedCount > 0) {
    process.stdout.write(
      `\n${skippedCount} of ${tsFiles.length} kit${tsFiles.length === 1 ? '' : 's'} skipped due to drift.` +
        ` Re-run with --force to overwrite, or move edits into the source.\n`,
    );
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

  return skippedCount > 0 ? 1 : 0;
}

/** Location fields for a manifest kit entry. */
interface KitLocationFields {
  path: string;
  source: string;
  targetHash: string;
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
    targetHash: location.targetHash,
    ...(metadata.description !== undefined && { description: metadata.description }),
  };

  // Replace existing entry for this kit name, or append.
  const filtered = existingKits.filter((k) => k.name !== kitName);
  // eslint-disable-next-line unicorn/no-array-sort -- toSorted() requires es2023 lib
  const kits = [...filtered, entry].sort((a, b) => a.name.localeCompare(b.name));

  writeManifest(manifestPath, { version: 1, kits });
}

/** Read the manifest and index its kits by name, returning an empty map on any read failure. */
function loadExistingKitsByName(manifestPath: string): Map<string, RdyManifestKit> {
  const map = new Map<string, RdyManifestKit>();
  try {
    const manifest = readManifest(manifestPath);
    for (const kit of manifest.kits) {
      map.set(kit.name, kit);
    }
  } catch {
    // Missing or unreadable manifest — drift gate becomes a no-op for this run.
  }
  return map;
}

/** Derive a `.js` sibling path from a `.ts`/`.mts`/`.cts` input. */
function deriveJsPath(inputPath: string): string {
  const ext = path.extname(inputPath);
  if (ext === '.ts' || ext === '.mts' || ext === '.cts') {
    return inputPath.slice(0, -ext.length) + '.js';
  }
  return `${inputPath}.js`;
}

/** Arguments for the per-kit drift-detection helper. */
interface DetectDriftArgs {
  skipManifest: boolean;
  force: boolean;
  existingKit: RdyManifestKit | undefined;
  manifestDir: string;
}

/** Materialized skip decision: the drift status to report plus the manifest entry to preserve. */
interface DriftSkip {
  status: Extract<DriftStatus, { kind: 'drift' }>;
  existingKit: RdyManifestKit;
}

/**
 * Evaluate the drift gate for a single kit. Returns the drift status and the manifest entry
 * to preserve when a skip is warranted, or undefined when the kit should proceed to compile.
 */
function detectDrift(args: DetectDriftArgs): DriftSkip | undefined {
  const { skipManifest, force, existingKit, manifestDir } = args;
  if (skipManifest || force || existingKit === undefined) return undefined;
  const status = checkDrift(existingKit, manifestDir);
  if (status.kind !== 'drift') return undefined;
  return { status, existingKit };
}

/** Format a single compile-result line with a change indicator. */
function formatResultLine(srcName: string, outName: string, changed: boolean): string {
  return changed ? `  📦 ${srcName} → ${outName}\n` : `  ${ICON_NO_CHANGES} ${srcName} — no changes\n`;
}

/** Format a drift-skip status line. Requires a `drift` status; other statuses never produce this line. */
function formatDriftLine(srcName: string, status: Extract<DriftStatus, { kind: 'drift' }>): string {
  const target = path.basename(status.resolvedPath);
  return `  ⚠️  ${srcName} — skipped (drift in ${target}; expected ${status.expected}, got ${status.actual})\n`;
}
