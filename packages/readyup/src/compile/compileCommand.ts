import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { EXIT_OK, EXIT_PROBLEMS_FOUND } from '../bin/exitCodes.ts';
import { loadConfig } from '../config/loadConfig.ts';
import { extractHint, extractMessage } from '../errors/error-handling.ts';
import { translateParseArgsError } from '../errors/parse-args-error.ts';
import { configError, usageError } from '../errors/RdyError.ts';
import { getLayout } from '../layout/engine.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { ManifestNotFoundError, readManifest } from '../manifest/readManifest.ts';
import { writeManifest } from '../manifest/writeManifest.ts';
import { writeHuman } from '../output/writeHuman.ts';
import { type JsonCompileKitEntry, type JsonCompileOutput, SCHEMA_VERSION } from '../schemas/compileOutputSchema.ts';
import { pluralizeWithCount } from '../utils/pluralize.ts';
import type { DriftStatus } from '../verify/checkDrift.ts';
import { checkDrift } from '../verify/checkDrift.ts';
import { hashFile } from '../verify/targetHash.ts';
import { VERSION } from '../version.ts';
import { collectSourceFiles } from './collectSourceFiles.ts';
import { compileConfig } from './compileConfig.ts';
import { deriveJsPath } from './deriveJsPath.ts';
import type { KitMetadata } from './validateCompiledOutput.ts';
import { validateCompiledOutput } from './validateCompiledOutput.ts';

const compileOptions = {
  force: { type: 'boolean' },
  json: { type: 'boolean' },
  manifest: { type: 'string' },
  output: { type: 'string', short: 'o' },
  'skip-manifest': { type: 'boolean' },
  // Declared so strict parsing accepts it; `routeCommand` consumed its value before dispatch.
  style: { type: 'string' },
} as const;

/** Separator between a compiled kit's source and its output. ASCII, so its width is two cells everywhere. */
const TRANSFORM_ARROW = '->';

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
    throw usageError(translateParseArgsError(error, 'compile', compileHints), { cause: error });
  }
  const { values, positionals } = parsed;

  // parseArgs accepts `--flag=` as an empty string; treat an empty value as missing.
  for (const [name, value] of Object.entries(values)) {
    if (value === '') {
      const flag = `--${name}`;
      throw usageError(compileHints[flag] ?? `${flag} requires a value`);
    }
  }

  if (positionals.length > 1) {
    throw usageError('Too many arguments. Expected a single input file.');
  }

  const force = values.force === true;
  const json = values.json === true;
  const outputPath = values.output;
  const skipManifest = values['skip-manifest'] === true;
  const manifestPath = resolveManifestPath(values.manifest);
  const inputPath = positionals[0];

  // Explicit input file -- compile just that one
  if (inputPath !== undefined) {
    return compileSingle({ inputPath, outputPath, skipManifest, force, manifestPath, json });
  }

  // No input file -- compile all sources from config
  if (outputPath !== undefined) {
    throw usageError('--output requires an input file');
  }

  return compileBatch({ skipManifest, force, manifestPath, json });
}

/** Arguments for the single-file compile path. */
interface CompileSingleArgs {
  inputPath: string;
  outputPath: string | undefined;
  skipManifest: boolean;
  force: boolean;
  manifestPath: string;
  json: boolean;
}

/** Compile a single explicit input file, applying the drift gate before overwriting. */
async function compileSingle(args: CompileSingleArgs): Promise<number> {
  const { inputPath, outputPath, skipManifest, force, manifestPath, json } = args;
  const manifestDir = path.dirname(manifestPath);

  const resolvedInputPath = path.resolve(inputPath);
  const resolvedOutputPath = path.resolve(outputPath ?? deriveJsPath(resolvedInputPath));
  const kitName = path.basename(resolvedOutputPath, '.js');
  const relInput = path.relative(process.cwd(), resolvedInputPath);

  writeHuman(formatSectionHeading('Compiling kit'), json);

  const existingKit = skipManifest ? undefined : loadExistingKitsByName(manifestPath).get(kitName);
  const drift = detectDrift({ skipManifest, force, existingKit, manifestDir });
  if (drift !== undefined) {
    writeHuman(formatDriftLine(relInput, drift.status), json);
    writeHuman('\nRe-run with --force to overwrite, or move edits into the source.\n', json);
    return finishCompile([{ name: kitName, status: 'skipped', error: formatDriftReason(drift.status) }], json);
  }

  let result;
  let metadata: KitMetadata;
  try {
    result = await compileConfig(inputPath, outputPath);
    metadata = await validateCompiledOutput(result.outputPath);
  } catch (error: unknown) {
    // A kit that fails to compile is a problem with the kit, not with the invocation.
    const message = extractMessage(error);
    process.stderr.write(`Error: ${message}\n`);
    return finishCompile([{ name: kitName, status: 'failed', error: message }], json);
  }

  const relOutput = path.relative(process.cwd(), result.outputPath);
  writeHuman(formatResultLine(relInput, relOutput, result.changed), json);

  if (!skipManifest) {
    try {
      const relOutputPath = path.relative(manifestDir, path.resolve(result.outputPath));
      const relSourcePath = path.relative(manifestDir, resolvedInputPath);
      upsertManifest(manifestPath, kitName, metadata, {
        path: relOutputPath,
        source: relSourcePath,
        sourceHash: hashFile(resolvedInputPath),
        targetHash: result.targetHash,
      });
    } catch (error: unknown) {
      throw configError(`Error writing manifest: ${extractMessage(error)}`, { cause: error });
    }
  }

  return finishCompile([{ name: kitName, status: 'compiled' }], json);
}

/**
 * Emit the compile payload under `--json` and reduce the run's per-kit statuses to an exit code.
 *
 * A kit left alone because it drifted counts against the run just as a failed one does: both mean
 * the compiled output on disk is not what the source says it should be.
 */
function finishCompile(kits: JsonCompileKitEntry[], json: boolean): number {
  const passed = kits.every((kit) => kit.status === 'compiled');

  if (json) {
    const output: JsonCompileOutput = { schemaVersion: SCHEMA_VERSION, passed, kits };
    process.stdout.write(JSON.stringify(output) + '\n');
  }

  return passed ? EXIT_OK : EXIT_PROBLEMS_FOUND;
}

/** Describe a drift skip for the JSON payload, where there is no formatted line to read. */
function formatDriftReason(status: Extract<DriftStatus, { kind: 'drift' }>): string {
  return `Compiled output has drifted from the manifest (expected ${status.expected}, got ${status.actual})`;
}

/** Resolve the manifest output path from the optional `--manifest` flag. */
function resolveManifestPath(flagValue: string | undefined): string {
  return path.resolve(process.cwd(), flagValue ?? DEFAULT_MANIFEST_PATH);
}

/** Arguments for the batch compile path. */
interface CompileBatchArgs {
  skipManifest: boolean;
  force: boolean;
  manifestPath: string;
  json: boolean;
}

/**
 * Compile all matching `.ts` files from the config-driven source directory.
 *
 * The sweep runs to completion: a kit that fails to compile is reported and the next one is tried,
 * so one broken kit cannot hide the state of every kit that sorts after it. Failures on the way to
 * the sweep — an unreadable config, an unwritable manifest — still throw, because they say nothing
 * about any individual kit.
 */
async function compileBatch(args: CompileBatchArgs): Promise<number> {
  const { skipManifest, force, manifestPath, json } = args;
  let config;
  try {
    config = await loadConfig();
  } catch (error: unknown) {
    throw configError(extractMessage(error), { cause: error, hint: extractHint(error) });
  }

  const srcDir = path.resolve(process.cwd(), config.compile.srcDir);
  const outDir = path.resolve(process.cwd(), config.compile.outDir);

  // A missing source directory is treated as an empty one rather than as an error.
  const srcDirExists = existsSync(srcDir);

  let tsFiles: string[] = [];
  if (srcDirExists) {
    try {
      tsFiles = collectSourceFiles(srcDir, config.compile.include);
    } catch (error: unknown) {
      throw configError(`Failed to read source directory: ${extractMessage(error)}`, { cause: error });
    }
  }

  if (tsFiles.length === 0) {
    return finishEmptySweep({ srcDir, srcDirExists, skipManifest, manifestPath, json });
  }

  const anchor = resolveWorkspaceAnchor(srcDir);
  const relSrcDir = path.relative(anchor, srcDir);
  const relOutDir = path.relative(anchor, outDir);
  const label =
    srcDir === outDir ? `Compiling kits in ${relSrcDir}` : `Compiling kits from ${relSrcDir} to ${relOutDir}`;
  writeHuman(formatSectionHeading(label), json);

  const manifestDir = path.dirname(manifestPath);
  const existingKitsByName = skipManifest ? new Map<string, RdyManifestKit>() : loadExistingKitsByName(manifestPath);
  const kitEntries: RdyManifestKit[] = [];
  const kitResults: JsonCompileKitEntry[] = [];
  let skippedCount = 0;
  let failedCount = 0;

  for (const fileName of tsFiles) {
    const srcFile = path.join(srcDir, fileName);
    const outFile = path.join(outDir, fileName.replace(/\.ts$/, '.js'));
    const kitName = path.basename(outFile, '.js');

    const drift = detectDrift({ skipManifest, force, existingKit: existingKitsByName.get(kitName), manifestDir });
    if (drift !== undefined) {
      writeHuman(formatDriftLine(fileName, drift.status), json);
      kitEntries.push(drift.existingKit);
      kitResults.push({ name: kitName, status: 'skipped', error: formatDriftReason(drift.status) });
      skippedCount += 1;
      continue;
    }

    try {
      const result = await compileConfig(srcFile, outFile);
      const metadata = await validateCompiledOutput(result.outputPath);
      const outName = fileName.replace(/\.ts$/, '.js');
      writeHuman(formatResultLine(fileName, outName, result.changed), json);

      const relOutputPath = path.relative(manifestDir, path.resolve(result.outputPath));
      const relSourcePath = path.relative(manifestDir, srcFile);
      kitEntries.push({
        name: kitName,
        path: relOutputPath,
        readyupVersion: VERSION,
        source: relSourcePath,
        sourceHash: hashFile(srcFile),
        targetHash: result.targetHash,
        ...(metadata.checklists.length > 0 && { checklists: metadata.checklists }),
        ...(metadata.description !== undefined && { description: metadata.description }),
      });
      kitResults.push({ name: kitName, status: 'compiled' });
    } catch (error: unknown) {
      // A kit that fails to compile is a problem with the kit, not with the invocation, so the sweep
      // carries on. The sweep replaces the whole manifest, so a prior record has to be pushed back to
      // survive, and it still describes the tree: an esbuild failure leaves the previous output and
      // its hash intact, and a validation failure deletes the output for `verify` to report missing.
      const existingKit = existingKitsByName.get(kitName);
      if (existingKit !== undefined) kitEntries.push(existingKit);

      const message = extractMessage(error);
      process.stderr.write(`Error compiling ${fileName}: ${message}\n`);
      kitResults.push({ name: kitName, status: 'failed', error: message });
      failedCount += 1;
    }
  }

  if (skippedCount > 0) {
    writeHuman(
      `\n${skippedCount} of ${pluralizeWithCount(tsFiles.length, 'kit')} skipped due to drift.` +
        ` Re-run with --force to overwrite, or move edits into the source.\n`,
      json,
    );
  }

  if (failedCount > 0) {
    writeHuman(`\n${failedCount} of ${pluralizeWithCount(tsFiles.length, 'kit')} failed to compile.\n`, json);
  }

  if (!skipManifest) {
    try {
      kitEntries.sort((a, b) => a.name.localeCompare(b.name));
      writeManifest(manifestPath, { version: 1, kits: kitEntries });
    } catch (error: unknown) {
      throw configError(`Error writing manifest: ${extractMessage(error)}`, { cause: error });
    }
  }

  return finishCompile(kitResults, json);
}

/** Arguments for the no-kits early return of a batch compile. */
interface FinishEmptySweepArgs {
  srcDir: string;
  srcDirExists: boolean;
  skipManifest: boolean;
  manifestPath: string;
  json: boolean;
}

/**
 * Reports a sweep that found no kits, and settles what becomes of the manifest.
 *
 * An existing manifest may still list kits that have since been deleted, so it is emptied rather than
 * left stale. A project holding neither kits nor a manifest is not one this sweep describes, and gets
 * none seeded for it.
 */
function finishEmptySweep(args: FinishEmptySweepArgs): number {
  const { srcDir, srcDirExists, skipManifest, manifestPath, json } = args;

  const relSrc = path.relative(process.cwd(), srcDir);
  const reason = srcDirExists ? `No .ts files found in ${relSrc}` : `Source directory not found: ${relSrc}`;
  const writesManifest = !skipManifest && existsSync(manifestPath);

  writeHuman(`${reason}${formatManifestOutcome(skipManifest, writesManifest)}\n`, json);

  if (writesManifest) {
    try {
      writeManifest(manifestPath, { version: 1, kits: [] });
    } catch (error: unknown) {
      throw configError(`Error writing manifest: ${extractMessage(error)}`, { cause: error });
    }
  }

  return finishCompile([], json);
}

/** Location fields for a manifest kit entry. */
interface KitLocationFields {
  path: string;
  source: string;
  sourceHash: string;
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
      process.stderr.write(`Warning: ${message}; starting with empty manifest\n`);
    }
  }

  const entry: RdyManifestKit = {
    name: kitName,
    path: location.path,
    readyupVersion: VERSION,
    source: location.source,
    sourceHash: location.sourceHash,
    targetHash: location.targetHash,
    ...(metadata.checklists.length > 0 && { checklists: metadata.checklists }),
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
      process.stderr.write(`Warning: ${message}; drift gate skipped\n`);
    }
  }
  return map;
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

/** Returns a line naming the output a rebuilt kit produced, or reporting an unchanged one as skipped. */
function formatResultLine(srcName: string, outName: string, changed: boolean): string {
  if (!changed) {
    return getLayout().formatCheckLine({ token: 'skippedOptional', name: srcName, detail: 'no changes' }) + '\n';
  }

  const claim = getLayout().formatCheckLine({ token: 'passed', name: srcName });
  return `${claim} ${TRANSFORM_ARROW} ${getLayout().inlineGlyph('kit')}${outName}\n`;
}

/** Returns a warning line for a source, with the hash mismatch from `status` in a block beneath. */
function formatDriftLine(srcName: string, status: Extract<DriftStatus, { kind: 'drift' }>): string {
  const target = path.basename(status.resolvedPath);
  const claim = getLayout().formatCheckLine({ token: 'failedWarn', name: srcName });
  const reason = `drift in ${target}: expected ${status.expected}, got ${status.actual}`;

  return [claim, ...getLayout().formatReasonBlock([reason])].join('\n') + '\n';
}

/** Returns a section heading as a single writable string, newline-terminated. */
function formatSectionHeading(label: string): string {
  return `${getLayout().formatHeading(label, 'section')}\n`;
}

/**
 * Returns the clause naming what a sweep that found no kits did with the manifest.
 *
 * Empty under `--skip-manifest`, where the manifest was never consulted and so has nothing to report.
 */
function formatManifestOutcome(skipManifest: boolean, writesManifest: boolean): string {
  if (skipManifest) return '';
  return writesManifest ? '; manifest now lists no kits' : '; manifest not written';
}

/**
 * Returns the directory a compile heading names its paths against.
 *
 * The nearest enclosing workspace root wins, then the nearest repository root, then the working
 * directory. `pnpm -r exec rdy compile` gives each workspace its own working directory, so naming paths
 * against that one would head every workspace's output identically and leave the reader unable to tell
 * whose kits a line reports. A repository with no workspace file still gets a stable anchor, and a
 * directory under neither falls back to the behaviour it has always had.
 */
function resolveWorkspaceAnchor(srcDir: string): string {
  const markers = ['pnpm-workspace.yaml', '.git'];

  for (const marker of markers) {
    let directory = srcDir;
    while (directory !== path.dirname(directory)) {
      if (existsSync(path.join(directory, marker))) return directory;
      directory = path.dirname(directory);
    }
  }

  return process.cwd();
}
