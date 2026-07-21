import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import picomatch from 'picomatch';

import { loadConfig } from '../loadConfig.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { ManifestNotFoundError, readManifest } from '../manifest/readManifest.ts';
import { writeManifest } from '../manifest/writeManifest.ts';
import { ICON_SKIPPED_NA as ICON_NO_CHANGES } from '../reportRdy.ts';
import { extractMessage } from '../utils/error-handling.ts';
import { translateParseArgsError } from '../utils/parse-args-error.ts';
import type { DriftStatus } from '../verify/checkDrift.ts';
import { checkDrift } from '../verify/checkDrift.ts';
import { VERSION } from '../version.ts';
import { compileConfig } from './compileConfig.ts';
import type { KitMetadata } from './validateCompiledOutput.ts';
import { validateCompiledOutput } from './validateCompiledOutput.ts';

const compileOptions = {
  force: { type: 'boolean' },
  manifest: { type: 'string' },
  output: { type: 'string', short: 'o' },
  'skip-manifest': { type: 'boolean' },
} as const;

/** Domain-specific hints for compile flags that require a value. */
const compileHints: Record<string, string> = {
  '--output': '--output requires a path argument',
};

/**
 * Handle the `compile` subcommand: parse arguments, invoke the bundler, and report the result.
 *
 * Returns a numeric exit code.
 */
export async function compileCommand(args: string[]): Promise<number> {
  let parsed;
  try {
    parsed = nodeParseArgs({ args, options: compileOptions, strict: true, allowPositionals: true });
  } catch (error: unknown) {
    process.stderr.write(`Error: ${translateParseArgsError(error, compileHints)}\n`);
    return 1;
  }
  const { values, positionals } = parsed;

  // parseArgs accepts `--flag=` as an empty string; treat an empty value as missing.
  for (const [name, value] of Object.entries(values)) {
    if (value === '') {
      const flag = `--${name}`;
      process.stderr.write(`Error: ${compileHints[flag] ?? `${flag} requires a value`}\n`);
      return 1;
    }
  }

  const force = values.force === true;
  const outputPath = values.output;
  const skipManifest = values['skip-manifest'] === true;
  const manifestPath = resolveManifestPath(values.manifest);

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
  return entries.filter((name) => name.endsWith('.ts') && (isMatch === undefined || isMatch(name))).toSorted();
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

  // A missing source directory is treated as an empty one: fall through to the empty-kit-list
  // manifest write below rather than erroring.
  const srcDirExists = existsSync(srcDir);

  let tsFiles: string[] = [];
  if (srcDirExists) {
    try {
      tsFiles = collectSourceFiles(srcDir, config.compile.include);
    } catch (error: unknown) {
      const message = extractMessage(error);
      process.stderr.write(`Error: Failed to read source directory: ${message}\n`);
      return 1;
    }
  }

  if (tsFiles.length === 0) {
    const relSrc = path.relative(process.cwd(), srcDir);
    const reason = srcDirExists
      ? `No .ts files found in ${relSrc}`
      : `Source directory not found: ${relSrc} — treating as empty`;
    process.stdout.write(`${reason}\n`);
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
        readyupVersion: VERSION,
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
    readyupVersion: VERSION,
    source: location.source,
    targetHash: location.targetHash,
    ...(metadata.description !== undefined && { description: metadata.description }),
  };

  // Replace existing entry for this kit name, or append.
  const filtered = existingKits.filter((k) => k.name !== kitName);
  const kits = [...filtered, entry].toSorted((a, b) => a.name.localeCompare(b.name));

  writeManifest(manifestPath, { version: 1, kits });
}

/** Read the manifest and index its kits by name. Missing manifest is expected (first compile); other failures are surfaced on stderr and treated as a no-op drift gate. */
function loadExistingKitsByName(manifestPath: string): Map<string, RdyManifestKit> {
  const map = new Map<string, RdyManifestKit>();
  try {
    const manifest = readManifest(manifestPath);
    for (const kit of manifest.kits) {
      map.set(kit.name, kit);
    }
  } catch (error: unknown) {
    if (!(error instanceof ManifestNotFoundError)) {
      const message = extractMessage(error);
      process.stderr.write(`Warning: ${message} — drift gate skipped\n`);
    }
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
