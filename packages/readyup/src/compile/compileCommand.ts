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
import type { JsonCompileKitEntry } from '../schemas/compileOutputSchema.ts';
import {
  deriveClosureFields,
  detectDrift,
  loadExistingKitsByName,
  resolveManifestPath,
  upsertManifest,
} from './compile-manifest.ts';
import { finishCompile } from './compile-outcome.ts';
import {
  formatDriftLine,
  formatDriftReason,
  formatDriftRemedy,
  formatResultLine,
  formatSectionHeading,
} from './compile-report.ts';
import { compileConfig } from './compileConfig.ts';
import { compileProject } from './compileProject.ts';
import { compileRecursive } from './compileRecursive.ts';
import { deriveJsPath } from './deriveJsPath.ts';
import { warnOnInlinedJson } from './warnOnInlinedJson.ts';

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

  const force = values.force === true;
  const json = values.json === true;
  const outputPath = values.output;
  const skipManifest = values['skip-manifest'] === true;

  if (recursive) {
    return compileRecursive({ force, skipManifest, json });
  }

  const manifestPath = resolveManifestPath(values.manifest);
  const inputPath = positionals[0];

  // Explicit input file -- compile just that one
  if (inputPath !== undefined) {
    return compileSingle({ inputPath, outputPath, skipManifest, force, manifestPath, json, configPath: values.config });
  }

  // No input file -- compile the sources that the config selects
  if (outputPath !== undefined) {
    throw usageError('--output requires an input file');
  }

  return compileBatch({ skipManifest, force, manifestPath, json, configPath: values.config });
}

// region | Helpers

/** Arguments for the batch compile path. */
interface CompileBatchArgs {
  skipManifest: boolean;
  force: boolean;
  manifestPath: string;
  json: boolean;
  configPath: string | undefined;
}

/** Compiles every kit source of the working directory's project, under its config or the one named by `--config`. */
async function compileBatch(args: CompileBatchArgs): Promise<number> {
  const { skipManifest, force, manifestPath, json, configPath } = args;
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
    force,
    skipManifest,
    json,
  });
  return finishCompile(outcome, json);
}

/** Arguments for the single-file compile path. */
interface CompileSingleArgs {
  inputPath: string;
  outputPath: string | undefined;
  skipManifest: boolean;
  force: boolean;
  manifestPath: string;
  json: boolean;
  configPath: string | undefined;
}

/** Compiles a single explicit input file, applying the drift gate before overwriting. */
async function compileSingle(args: CompileSingleArgs): Promise<number> {
  const { inputPath, outputPath, skipManifest, force, manifestPath, json, configPath } = args;
  const manifestDir = path.dirname(manifestPath);

  const resolvedInputPath = path.resolve(inputPath);
  const resolvedOutputPath = path.resolve(outputPath ?? deriveJsPath(resolvedInputPath));
  // The config is read for `outDir` alone, which gives the kit its name: The sources that `include` and
  // `exclude` select matter to a sweep rather than to a named file.
  const config = await loadConfigForSingle(configPath);
  const kitName = deriveKitNameFromBundle(resolvedOutputPath, path.resolve(config.compile.outDir));
  const relInput = path.relative(process.cwd(), resolvedInputPath);

  writeHuman(formatSectionHeading('Compiling kit'), json);

  const existingKit = skipManifest ? undefined : loadExistingKitsByName(manifestPath).get(kitName);
  const drift = detectDrift({ skipManifest, force, existingKit, manifestDir });
  if (drift !== undefined) {
    writeHuman(formatDriftLine(relInput, drift.status), json);
    writeHuman(`\n${formatDriftRemedy({ hasOrphan: false, hasSourced: true })}\n`, json);
    const kits: JsonCompileKitEntry[] = [{ name: kitName, status: 'skipped', error: formatDriftReason(drift.status) }];
    return finishCompile({ kits, removed: [], warnings: [] }, json);
  }

  let result;
  try {
    result = await compileConfig(inputPath, outputPath);
  } catch (error: unknown) {
    // A kit that fails to compile is a problem with the kit, not with the invocation.
    const message = describeError(error);
    process.stderr.write(`Error: ${message}\n`);
    return finishCompile(
      { kits: [{ name: kitName, status: 'failed', error: message }], removed: [], warnings: [] },
      json,
    );
  }

  const relOutput = path.relative(process.cwd(), result.outputPath);
  writeHuman(formatResultLine(relInput, relOutput, result.changed), json);
  const warnings = warnOnInlinedJson(kitName, result.inlinedJson);

  if (!skipManifest) {
    try {
      const relOutputPath = path.relative(manifestDir, path.resolve(result.outputPath));
      const relSourcePath = path.relative(manifestDir, resolvedInputPath);
      const closure = deriveClosureFields(result.inputs, resolvedInputPath, manifestDir);
      upsertManifest(manifestPath, kitName, result.metadata, {
        bundledDependencies: result.bundledDependencies,
        esbuildVersion: result.esbuildVersion,
        inputs: closure.inputs,
        path: relOutputPath,
        source: relSourcePath,
        sourceHash: closure.sourceHash,
        targetHash: result.targetHash,
      });
    } catch (error: unknown) {
      throw configError(`Error writing manifest: ${describeError(error)}`, { cause: error });
    }
  }

  return finishCompile({ kits: [{ name: kitName, status: 'compiled' }], removed: [], warnings }, json);
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
