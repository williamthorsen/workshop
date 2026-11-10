import assert from 'node:assert';
import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { loadConfig } from '../config/loadConfig.ts';
import { extractHint } from '../errors/error-handling.ts';
import { translateParseArgsError } from '../errors/parse-args-error.ts';
import { configError, usageError } from '../errors/RdyError.ts';
import { deriveKitNameFromBundle } from '../kits/deriveKitName.ts';
import type { ResolvedRdyConfig } from '../kits/types.ts';
import { writeHuman } from '../output/writeHuman.ts';
import { toDisplayPath } from '../portable/toDisplayPath.ts';
import { loadExistingKitsByName, resolveManifestPath, upsertManifest } from './compile-manifest.ts';
import { finishCompile } from './compile-outcome.ts';
import { formatDriftRemedy, formatSectionHeading } from './compile-report.ts';
import { compileKit } from './compileKit.ts';
import { compileProject } from './compileProject.ts';
import { compileRecursive } from './compileRecursive.ts';
import { deriveJsPath } from './deriveJsPath.ts';

const compileOptions = {
  config: { type: 'string' },
  force: { type: 'boolean' },
  json: { type: 'boolean' },
  manifest: { type: 'string' },
  output: { type: 'string', short: 'o' },
  recursive: { type: 'boolean' },
  'skip-manifest': { type: 'boolean' },
  // Declared so that strict parsing accepts it; `routeCommand` consumed its value before dispatch.
  style: { type: 'string' },
} as const;

/** Domain-specific hints for compile flags that require a value. */
const compileHints: Record<string, string> = {
  '--config': '--config requires a path argument',
  '--output': '--output requires a path argument',
};

/** Runs the `compile` subcommand, returning the exit code produced by its parse, bundle, and report. */
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

  const recursive = values.recursive === true;

  // `--recursive` sweeps every project below the working directory, while each of these names a single target.
  if (recursive && positionals.length > 0) {
    throw usageError('--recursive and an input file are mutually exclusive');
  }

  if (recursive && values.output !== undefined) {
    throw usageError('--recursive and --output are mutually exclusive');
  }

  if (recursive && values.manifest !== undefined) {
    throw usageError('--recursive and --manifest are mutually exclusive');
  }

  // A recursive sweep reads each project's own config, so there is no single config for `--config` to name.
  if (recursive && values.config !== undefined) {
    throw usageError('--recursive and --config are mutually exclusive');
  }

  if (positionals.length > 1) {
    throw usageError('Too many arguments. Expected a single input file.');
  }

  const shouldForce = values.force === true;
  const isJson = values.json === true;
  const outputPath = values.output;
  const shouldSkipManifest = values['skip-manifest'] === true;

  if (recursive) {
    return compileRecursive({ shouldForce, shouldSkipManifest, isJson });
  }

  const manifestPath = resolveManifestPath(values.manifest);
  const inputPath = positionals[0];

  // Explicit input file -- compile just that one
  if (inputPath !== undefined) {
    return compileSingle({
      inputPath,
      outputPath,
      shouldSkipManifest,
      shouldForce,
      manifestPath,
      isJson,
      configPath: values.config,
    });
  }

  // No input file -- compile the sources that the config selects
  if (outputPath !== undefined) {
    throw usageError('--output requires an input file');
  }

  return compileBatch({ shouldSkipManifest, shouldForce, manifestPath, isJson, configPath: values.config });
}

// region | Helpers

/** Compiles every kit source of the working directory's project, under its config or the one named by `--config`. */
async function compileBatch(args: CompileBatchArgs): Promise<number> {
  const { shouldSkipManifest, shouldForce, manifestPath, isJson, configPath } = args;
  let config;
  try {
    config = await loadConfig({ ...(configPath !== undefined && { overridePath: configPath }) });
  } catch (error: unknown) {
    throw configError(describeError(error), { cause: error, hint: extractHint(error) });
  }

  const outcome = await compileProject({
    projectDir: process.cwd(),
    config,
    manifestPath,
    shouldForce,
    shouldSkipManifest,
    isJson,
  });
  return finishCompile(outcome, isJson);
}

/** Arguments for the batch compile path. */
interface CompileBatchArgs {
  shouldSkipManifest: boolean;
  shouldForce: boolean;
  manifestPath: string;
  isJson: boolean;
  configPath: string | undefined;
}

/** Compiles a single explicit input file, applying the drift gate before overwriting. */
async function compileSingle(args: CompileSingleArgs): Promise<number> {
  const { inputPath, outputPath, shouldSkipManifest, shouldForce, manifestPath, isJson, configPath } = args;
  const manifestDir = path.dirname(manifestPath);

  const resolvedInputPath = path.resolve(inputPath);
  const resolvedOutputPath = path.resolve(outputPath ?? deriveJsPath(resolvedInputPath));
  // The config is read for `outDir` alone, which gives the kit its name: The sources that `include` and
  // `exclude` select matter to a sweep rather than to a named file.
  const config = await loadConfigForSingle(configPath);
  const kitName = deriveKitNameFromBundle(resolvedOutputPath, path.resolve(config.compile.outDir));
  const displayInput = toDisplayPath(resolvedInputPath);

  writeHuman(formatSectionHeading('Compiling kit'), isJson);

  const outcome = await compileKit({
    describeFailure: describeError,
    displayInput,
    existingKit: shouldSkipManifest ? undefined : loadExistingKitsByName(manifestPath).get(kitName),
    failureSubject: undefined,
    formatOutput: toDisplayPath,
    inputPath,
    isJson,
    kitName,
    manifestDir,
    outputPath,
    project: undefined,
    resolvedInputPath,
    shouldForce,
    shouldSkipManifest,
  });

  if (outcome.kit.status === 'skipped') {
    writeHuman(`\n${formatDriftRemedy({ hasOrphan: false, hasSourced: true })}\n`, isJson);
  }

  if (outcome.kit.status !== 'compiled') {
    return finishCompile({ kits: [outcome.kit], removed: [], warnings: [] }, isJson);
  }

  if (!shouldSkipManifest) {
    const { entry } = outcome;
    assert.ok(entry !== undefined, 'A compiled kit has a manifest entry');
    try {
      upsertManifest(manifestPath, entry);
    } catch (error: unknown) {
      throw configError(`Cannot write manifest: ${describeError(error)}`, { cause: error });
    }
  }

  return finishCompile({ kits: [outcome.kit], removed: [], warnings: outcome.warnings }, isJson);
}

/** Arguments for the single-file compile path. */
interface CompileSingleArgs {
  inputPath: string;
  outputPath: string | undefined;
  shouldSkipManifest: boolean;
  shouldForce: boolean;
  manifestPath: string;
  isJson: boolean;
  configPath: string | undefined;
}

/** Loads the config that a single-file compile reads, reporting a config that cannot be evaluated as a config error. */
async function loadConfigForSingle(configPath: string | undefined): Promise<ResolvedRdyConfig> {
  try {
    return await loadConfig({ ...(configPath !== undefined && { overridePath: configPath }) });
  } catch (error: unknown) {
    throw configError(describeError(error), { cause: error, hint: extractHint(error) });
  }
}

// endregion | Helpers
