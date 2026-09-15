import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { pluralizeWithCount } from '@williamthorsen/toolbelt.strings';

import { EXIT_OK, EXIT_PROBLEMS_FOUND } from '../bin/exitCodes.ts';
import { loadConfig } from '../config/loadConfig.ts';
import { extractHint } from '../errors/error-handling.ts';
import { translateParseArgsError } from '../errors/parse-args-error.ts';
import { configError, internalError, RdyError, usageError } from '../errors/RdyError.ts';
import type { ResolvedRdyConfig } from '../kits/types.ts';
import { getLayout } from '../layout/engine.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RdyManifestInput, RdyManifestKit } from '../manifest/manifestSchema.ts';
import { ManifestNotFoundError, readManifest } from '../manifest/readManifest.ts';
import { writeManifest } from '../manifest/writeManifest.ts';
import { writeHuman } from '../output/writeHuman.ts';
import { discoverKitProjects, type Project } from '../projects/project-discovery.ts';
import type { RaisedWarning } from '../schemas/common.ts';
import {
  type JsonCompileKitEntry,
  type JsonCompileOutput,
  type JsonCompileProjectEntry,
  type JsonCompileRemovedEntry,
  SCHEMA_VERSION,
} from '../schemas/compileOutputSchema.ts';
import { checkDrift, type DriftStatus } from '../verify/checkDrift.ts';
import { VERSION } from '../version.ts';
import { collectSourceFiles } from './collectSourceFiles.ts';
import { compileConfig } from './compileConfig.ts';
import type { CompiledInput } from './CompiledInput.ts';
import { deriveJsPath } from './deriveJsPath.ts';
import { type OrphanOutcome, pruneOrphanedEntries } from './pruneOrphanedEntries.ts';
import { type KitMetadata, validateCompiledOutput } from './validateCompiledOutput.ts';
import { warnOnInlinedJson } from './warnOnInlinedJson.ts';
import { warnOnUnrecordedBundles, type WarnOnUnrecordedBundlesArgs } from './warnOnUnrecordedBundles.ts';

const compileOptions = {
  config: { type: 'string' },
  force: { type: 'boolean' },
  json: { type: 'boolean' },
  manifest: { type: 'string' },
  output: { type: 'string', short: 'o' },
  recursive: { type: 'boolean' },
  'skip-manifest': { type: 'boolean' },
  // Declared so strict parsing accepts it; `routeCommand` consumed its value before dispatch.
  style: { type: 'string' },
} as const;

/** Clause explaining why a bundle is an orphan, shared by its human line and its JSON reason. */
const NO_SOURCE_CLAUSE = 'no source compiles to it';

/** Separator between a compiled kit's source and its output. ASCII, so its width is two cells everywhere. */
const TRANSFORM_ARROW = '->';

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

  // A sweep reads each project's own config, and a single-file compile reads none.
  if (recursive && values.config !== undefined) {
    throw usageError('--recursive and --config are mutually exclusive');
  }

  if (positionals.length > 0 && values.config !== undefined) {
    throw usageError('--config and an input file are mutually exclusive');
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
    return compileSingle({ inputPath, outputPath, skipManifest, force, manifestPath, json });
  }

  // No input file -- compile the sources that the config selects
  if (outputPath !== undefined) {
    throw usageError('--output requires an input file');
  }

  return compileBatch({ skipManifest, force, manifestPath, json, configPath: values.config });
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

/** Compiles a single explicit input file, applying the drift gate before overwriting. */
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
    writeHuman(`\n${formatDriftRemedy({ hasOrphan: false, hasSourced: true })}\n`, json);
    const kits: JsonCompileKitEntry[] = [{ name: kitName, status: 'skipped', error: formatDriftReason(drift.status) }];
    return finishCompile({ kits, removed: [], warnings: [] }, json);
  }

  let result;
  let metadata: KitMetadata;
  try {
    result = await compileConfig(inputPath, outputPath);
    metadata = await validateCompiledOutput(result.outputPath);
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
      upsertManifest(manifestPath, kitName, metadata, {
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

/** What a compile run did, gathered for its payload and its exit code. */
interface CompileRunOutcome extends ProjectCompileOutcome {
  /** Every project that a recursive compile visited; absent from any other run. */
  projects?: JsonCompileProjectEntry[];
}

/**
 * Emits the compile payload under `--json` and reduces the run's per-kit statuses to an exit code.
 *
 * A kit left alone because it drifted counts against the run just as a failed one does: Both mean
 * the compiled output on disk is not what the source says it should be. A warning counts against nothing,
 * and reaches the payload only where one was raised, as a removal does.
 *
 * A project that failed counts against the run whether or not it contributed a kit.
 */
function finishCompile(outcome: CompileRunOutcome, json: boolean): number {
  const { kits, projects, removed, warnings } = outcome;
  const passed = kits.every((kit) => kit.status === 'compiled') && (projects ?? []).every((project) => project.passed);

  if (json) {
    const output: JsonCompileOutput = {
      schemaVersion: SCHEMA_VERSION,
      passed,
      kits,
      ...(projects !== undefined && { projects }),
      ...(removed.length > 0 && { removed }),
      ...(warnings.length > 0 && { warnings }),
    };
    process.stdout.write(JSON.stringify(output) + '\n');
  }

  return passed ? EXIT_OK : EXIT_PROBLEMS_FOUND;
}

/** Returns a drift skip described for the JSON payload, where there is no formatted line to read. */
function formatDriftReason(status: Extract<DriftStatus, { kind: 'drift' }>): string {
  return `Compiled output has drifted from the manifest (expected ${status.expected}, got ${status.actual})`;
}

/** Returns the manifest output path, taken from `--manifest` where that flag was given. */
function resolveManifestPath(flagValue: string | undefined): string {
  return path.resolve(process.cwd(), flagValue ?? DEFAULT_MANIFEST_PATH);
}

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

/** Arguments for the recursive compile path. */
interface CompileRecursiveArgs {
  force: boolean;
  skipManifest: boolean;
  json: boolean;
}

/**
 * Compiles the kits of every kit project below the working directory, each as `rdy compile` run from its directory would.
 *
 * The sweep runs to completion across projects as it does across kits: A project that cannot be compiled at
 * all is reported, the next project is tried, and the run fails. A project whose config cannot be evaluated
 * is one of those, and is never compiled under the defaults that discovery read it with.
 */
async function compileRecursive(args: CompileRecursiveArgs): Promise<number> {
  const { force, skipManifest, json } = args;
  const root = process.cwd();
  const projects = await discoverKitProjects({ root });

  if (projects.length === 0) {
    writeHuman('No kit projects found.\n', json);
    return finishCompile({ kits: [], projects: [], removed: [], warnings: [] }, json);
  }

  const kits: JsonCompileKitEntry[] = [];
  const projectEntries: JsonCompileProjectEntry[] = [];
  const removed: JsonCompileRemovedEntry[] = [];
  const warnings: RaisedWarning[] = [];
  let hasWrittenBlock = false;

  for (const project of projects) {
    if (project.configError !== undefined) {
      projectEntries.push(reportProjectFailure(project.dir, describeError(project.configError)));
      continue;
    }

    // A project failing on its config writes no block, so separation follows the blocks actually written.
    if (hasWrittenBlock) writeHuman('\n', json);
    hasWrittenBlock = true;

    const outcome = await compileSweptProject(project, { root, force, skipManifest, json });
    kits.push(...outcome.kits);
    projectEntries.push(outcome.entry);
    removed.push(...outcome.removed);
    warnings.push(...outcome.warnings);
  }

  const failedDirs = projectEntries.filter((entry) => !entry.passed).map((entry) => entry.project);
  if (failedDirs.length > 0) {
    writeHuman(
      `\nProblems in ${failedDirs.length} of ${pluralizeWithCount(projects.length, 'project')}: ${failedDirs.join(', ')}\n`,
      json,
    );
  }

  return finishCompile({ kits, projects: projectEntries, removed, warnings }, json);
}

/** Arguments shared by every project that a recursive compile visits. */
interface CompileSweptProjectArgs {
  root: string;
  force: boolean;
  skipManifest: boolean;
  json: boolean;
}

/** One project's contribution to a recursive compile. */
interface SweptProjectOutcome extends ProjectCompileOutcome {
  entry: JsonCompileProjectEntry;
}

/**
 * Compiles one discovered project, reporting a failure that stops the project rather than letting it end the sweep.
 *
 * Only an `RdyError` is a project failure. Anything else is a defect in rdy, and ends the run.
 */
async function compileSweptProject(project: Project, args: CompileSweptProjectArgs): Promise<SweptProjectOutcome> {
  const { root, force, skipManifest, json } = args;

  try {
    const outcome = await compileProject({
      projectDir: project.absolutePath,
      config: project.config,
      manifestPath: project.manifestPath,
      force,
      skipManifest,
      json,
      sweep: { root, project: project.dir },
    });
    return {
      ...outcome,
      entry: { project: project.dir, passed: outcome.kits.every((kit) => kit.status === 'compiled') },
    };
  } catch (error: unknown) {
    if (!(error instanceof RdyError)) throw error;
    return { kits: [], entry: reportProjectFailure(project.dir, error.message), removed: [], warnings: [] };
  }
}

/** Writes the failure of a project that could not be compiled at all, and returns the project's entry. */
function reportProjectFailure(dir: string, message: string): JsonCompileProjectEntry {
  process.stderr.write(`Error in ${dir}: ${message}\n`);
  return { project: dir, passed: false, error: message };
}

/** Arguments for compiling one project's kit sources. */
interface CompileProjectArgs {
  /** Directory against which the config's `srcDir` and `outDir` resolve. */
  projectDir: string;
  config: ResolvedRdyConfig;
  manifestPath: string;
  force: boolean;
  skipManifest: boolean;
  json: boolean;
  /** The recursive compile that the project belongs to, which names every path against its root. */
  sweep?: SweepContext;
}

/** Each kit's outcome in a project compile, the bundles that it removed, and the warnings that its kits raised. */
interface ProjectCompileOutcome {
  kits: JsonCompileKitEntry[];
  removed: JsonCompileRemovedEntry[];
  warnings: RaisedWarning[];
}

/** Where a project sits in a recursive compile. */
interface SweepContext {
  /** Directory from which the sweep descended. */
  root: string;
  /** The project's directory relative to `root`, as discovery reports it. */
  project: string;
}

/**
 * Compiles every matching `.ts` file in a project's config-driven source directory, prunes the bundles of kits that
 * no source compiles to any longer, and returns what became of each kit.
 *
 * The sweep runs to completion: A kit that fails to compile is reported and the next one is tried,
 * so one broken kit cannot hide the state of every kit that sorts after it. Failures on the way to
 * the sweep -- an unreadable source directory, an unwritable manifest -- still throw, because they say
 * nothing about any individual kit.
 *
 * A sweep that finds no sources still prunes, and writes the manifest only where one exists: That manifest may list
 * kits since deleted, and a project holding neither kits nor a manifest gets none seeded for it.
 */
async function compileProject(args: CompileProjectArgs): Promise<ProjectCompileOutcome> {
  const { projectDir, config, manifestPath, force, skipManifest, json, sweep } = args;

  const srcDir = path.resolve(projectDir, config.compile.srcDir);
  const outDir = path.resolve(projectDir, config.compile.outDir);

  // A missing source directory is treated as an empty one rather than as an error.
  const srcDirExists = existsSync(srcDir);

  let tsFiles: string[] = [];
  if (srcDirExists) {
    try {
      tsFiles = collectSourceFiles(srcDir, config.compile);
    } catch (error: unknown) {
      throw configError(`Failed to read source directory: ${describeError(error)}`, { cause: error });
    }
  }

  const isEmptySweep = tsFiles.length === 0;
  if (!isEmptySweep) {
    const anchor = sweep?.root ?? resolveWorkspaceAnchor(srcDir, projectDir);
    writeHuman(formatSectionHeading(formatSweepLabel(anchor, srcDir, outDir)), json);
  }

  const manifestDir = path.dirname(manifestPath);
  const existingKitsByName = skipManifest ? new Map<string, RdyManifestKit>() : loadExistingKitsByName(manifestPath);
  const sharedKitNames = findSharedKitNames(tsFiles);
  const sourceContext: SourceSweepContext = {
    existingKitsByName,
    force,
    json,
    manifestDir,
    outDir,
    project: sweep?.project,
    sharedKitNames,
    skipManifest,
    srcDir,
    sweepRoot: sweep?.root,
  };

  const sources: SourceOutcome[] = [];
  for (const fileName of tsFiles) {
    sources.push(await compileSource(fileName, sourceContext));
  }

  // A shared name keeps its prior entry once, however many sources claim it.
  const kitEntries = existingKitsByName
    .values()
    .filter((kit) => sharedKitNames.has(kit.name))
    .toArray();
  kitEntries.push(...sources.flatMap((source) => (source.entry === undefined ? [] : [source.entry])));
  const kitResults = sources.map((source) => source.kit);
  const warnings = sources.flatMap((source) => source.warnings);
  const skippedCount = kitResults.filter((kit) => kit.status === 'skipped').length;
  const failedCount = kitResults.filter((kit) => kit.status === 'failed').length;

  const sweptKitNames = new Set(kitResults.map((kit) => kit.name));
  const pruned = pruneOrphanedEntries({
    existingEntries: existingKitsByName.values(),
    force,
    manifestDir,
    outDir,
    sweptKitNames,
  });
  kitEntries.push(...pruned.keptEntries);
  const writesManifest = !skipManifest && (!isEmptySweep || existsSync(manifestPath));

  if (isEmptySweep) {
    const manifestOutcome = formatManifestOutcome(skipManifest, writesManifest, kitEntries.length);
    writeHuman(
      formatEmptySweepLine({ displayRoot: sweep?.root ?? projectDir, manifestOutcome, srcDir, srcDirExists }),
      json,
    );
  }

  const orphanReport = reportOrphans(pruned.orphans, { json, outDir, project: sweep?.project });
  kitResults.push(...orphanReport.kits);

  // A run that reads no manifest cannot tell a recorded bundle from an unrecorded one.
  if (!skipManifest) {
    warnings.push(...warnOnSweepBundles({ entries: kitEntries, manifestDir, outDir, sweptKitNames }));
  }

  const tally = formatSweepTally({
    compileFailedCount: failedCount,
    kitCount: tsFiles.length + pruned.orphans.length,
    orphanReport,
    sourcedSkippedCount: skippedCount,
  });
  if (tally !== '') writeHuman(tally, json);

  if (writesManifest) {
    try {
      kitEntries.sort((a, b) => a.name.localeCompare(b.name));
      writeManifest(manifestPath, { version: 1, kits: kitEntries });
    } catch (error: unknown) {
      throw configError(`Error writing manifest: ${describeError(error)}`, { cause: error });
    }
  }

  return { kits: kitResults, removed: orphanReport.removed, warnings };
}

/** What a project sweep shares with each of its sources. */
interface SourceSweepContext {
  existingKitsByName: Map<string, RdyManifestKit>;
  force: boolean;
  json: boolean;
  manifestDir: string;
  outDir: string;
  /** The project named on the kit's JSON entry, given by a recursive compile alone. */
  project: string | undefined;
  /** Each kit name claimed by more than one of the sweep's sources, with the sources that claim it. */
  sharedKitNames: Map<string, string[]>;
  skipManifest: boolean;
  srcDir: string;
  /** Directory against which a failed source is named, given by a recursive compile alone. */
  sweepRoot: string | undefined;
}

/** One source's contribution to its project's compile. */
interface SourceOutcome {
  /**
   * The manifest entry recording the kit, absent for a kit that failed before it was ever recorded and for a source
   * whose kit name is shared, whose prior entry the project keeps once.
   */
  entry: RdyManifestKit | undefined;
  kit: JsonCompileKitEntry;
  warnings: RaisedWarning[];
}

/**
 * Compiles one source of a project sweep behind the shared-name and drift gates, and returns its contribution to the
 * project.
 */
async function compileSource(fileName: string, context: SourceSweepContext): Promise<SourceOutcome> {
  const {
    existingKitsByName,
    force,
    json,
    manifestDir,
    outDir,
    project,
    sharedKitNames,
    skipManifest,
    srcDir,
    sweepRoot,
  } = context;
  const projectField = project === undefined ? {} : { project };
  const srcFile = path.join(srcDir, fileName);
  const outName = fileName.replace(/\.ts$/, '.js');
  const outFile = path.join(outDir, outName);
  const kitName = deriveKitName(fileName);
  const existingKit = existingKitsByName.get(kitName);

  const namesakes = sharedKitNames.get(kitName);
  if (namesakes !== undefined) {
    const message = formatSharedKitNameError(
      kitName,
      namesakes.map((namesake) => describeSource(namesake, srcDir, sweepRoot)),
    );
    process.stderr.write(`Error compiling ${describeSource(fileName, srcDir, sweepRoot)}: ${message}\n`);
    return {
      entry: undefined,
      kit: { name: kitName, ...projectField, status: 'failed', error: message },
      warnings: [],
    };
  }

  const drift = detectDrift({ skipManifest, force, existingKit, manifestDir });
  if (drift !== undefined) {
    writeHuman(formatDriftLine(fileName, drift.status), json);
    return {
      entry: drift.existingKit,
      kit: { name: kitName, ...projectField, status: 'skipped', error: formatDriftReason(drift.status) },
      warnings: [],
    };
  }

  try {
    const result = await compileConfig(srcFile, outFile);
    const metadata = await validateCompiledOutput(result.outputPath);
    writeHuman(formatResultLine(fileName, outName, result.changed), json);

    const closure = deriveClosureFields(result.inputs, path.resolve(srcFile), manifestDir);
    return {
      entry: buildManifestKit(kitName, metadata, {
        bundledDependencies: result.bundledDependencies,
        esbuildVersion: result.esbuildVersion,
        inputs: closure.inputs,
        path: path.relative(manifestDir, path.resolve(result.outputPath)),
        source: path.relative(manifestDir, srcFile),
        sourceHash: closure.sourceHash,
        targetHash: result.targetHash,
      }),
      kit: { name: kitName, ...projectField, status: 'compiled' },
      warnings: warnOnInlinedJson(kitName, result.inlinedJson),
    };
  } catch (error: unknown) {
    // A kit that fails to compile is a problem with the kit, not with the invocation, so the sweep
    // goes on. The sweep replaces the whole manifest, so the kit keeps its prior record, which still
    // describes the tree: An esbuild failure leaves the previous output and its hash intact, and a
    // validation failure deletes the output for `verify` to report missing.
    const message = describeError(error);
    process.stderr.write(`Error compiling ${describeSource(fileName, srcDir, sweepRoot)}: ${message}\n`);
    return {
      entry: existingKit,
      kit: { name: kitName, ...projectField, status: 'failed', error: message },
      warnings: [],
    };
  }
}

/**
 * Warns on the bundles of a sweep that nothing accounts for, and raises an output directory that cannot be read as a
 * config error, as an unreadable source directory is.
 */
function warnOnSweepBundles(args: WarnOnUnrecordedBundlesArgs): RaisedWarning[] {
  try {
    return warnOnUnrecordedBundles(args);
  } catch (error: unknown) {
    throw configError(`Failed to read output directory: ${describeError(error)}`, { cause: error });
  }
}

/** Arguments for reporting the orphans of a project compile. */
interface ReportOrphansArgs {
  json: boolean;
  /** Directory against which a bundle is named, as a source is named against the source directory. */
  outDir: string;
  /** The project named on each JSON entry, given by a recursive compile alone. */
  project: string | undefined;
}

/** What reporting a sweep's orphans contributes to the project's outcome. */
interface OrphanReport {
  failedCount: number;
  kits: JsonCompileKitEntry[];
  removed: JsonCompileRemovedEntry[];
  skippedCount: number;
}

/**
 * Writes a line for each orphan and returns its contribution to the project's outcome.
 *
 * A removed bundle is a removal rather than a kit, so it counts against nothing. A kept one is a kit whose bundle is
 * not what its manifest entry says it should be, and counts against the run as any other skipped or failed kit does.
 */
function reportOrphans(orphans: OrphanOutcome[], args: ReportOrphansArgs): OrphanReport {
  const { json, outDir, project } = args;
  const projectField = project === undefined ? {} : { project };
  const report: OrphanReport = { failedCount: 0, kits: [], removed: [], skippedCount: 0 };

  for (const orphan of orphans) {
    const { bundlePath, name } = orphan;
    const bundleName = path.relative(outDir, bundlePath);

    switch (orphan.kind) {
      case 'removed':
        writeHuman(formatRemovalLine(bundleName), json);
        report.removed.push({ name, ...projectField, path: path.relative(process.cwd(), bundlePath) });
        break;
      case 'drift':
        writeHuman(formatDriftLine(bundleName, orphan.status, NO_SOURCE_CLAUSE), json);
        report.kits.push({
          name,
          ...projectField,
          status: 'skipped',
          error: `${formatDriftReason(orphan.status)}; ${NO_SOURCE_CLAUSE}`,
        });
        report.skippedCount += 1;
        break;
      case 'failed':
        process.stderr.write(`Error removing ${path.relative(process.cwd(), bundlePath)}: ${orphan.message}\n`);
        report.kits.push({ name, ...projectField, status: 'failed', error: orphan.message });
        report.failedCount += 1;
        break;
    }
  }

  return report;
}

/** Arguments for the line reporting a sweep that found no sources. */
interface EmptySweepLineArgs {
  /** Directory against which the line names the source directory. */
  displayRoot: string;
  /** The clause naming what became of the manifest, which may be empty. */
  manifestOutcome: string;
  srcDir: string;
  srcDirExists: boolean;
}

/** Returns the line reporting a sweep that found no sources, and why it found none. */
function formatEmptySweepLine({ displayRoot, manifestOutcome, srcDir, srcDirExists }: EmptySweepLineArgs): string {
  const relSrc = path.relative(displayRoot, srcDir);
  const reason = srcDirExists ? `No .ts files found in ${relSrc}` : `Source directory not found: ${relSrc}`;
  return `${reason}${manifestOutcome}\n`;
}

/** Returns the label heading a sweep, naming its directories against `anchor`. */
function formatSweepLabel(anchor: string, srcDir: string, outDir: string): string {
  const relSrcDir = path.relative(anchor, srcDir);
  if (srcDir === outDir) return `Compiling kits in ${relSrcDir}`;
  return `Compiling kits from ${relSrcDir} to ${path.relative(anchor, outDir)}`;
}

/** Counts of the kits that a sweep left out of line with their sources. */
interface SweepTally {
  /** Kits whose source failed to compile. */
  compileFailedCount: number;
  /** Every kit that the sweep reported on, orphans included. */
  kitCount: number;
  orphanReport: OrphanReport;
  /** Kits with a source whose bundle had drifted. */
  sourcedSkippedCount: number;
}

/** Returns the lines closing a sweep, one per kind of problem that it left, or an empty string where it left none. */
function formatSweepTally(tally: SweepTally): string {
  const { compileFailedCount, orphanReport, sourcedSkippedCount } = tally;
  const kits = pluralizeWithCount(tally.kitCount, 'kit');
  const lines: string[] = [];

  const skippedCount = sourcedSkippedCount + orphanReport.skippedCount;
  if (skippedCount > 0) {
    const remedy = formatDriftRemedy({ hasOrphan: orphanReport.skippedCount > 0, hasSourced: sourcedSkippedCount > 0 });
    lines.push(`\n${skippedCount} of ${kits} skipped due to drift. ${remedy}\n`);
  }

  if (compileFailedCount > 0) {
    lines.push(`\n${compileFailedCount} of ${kits} failed to compile.\n`);
  }

  if (orphanReport.failedCount > 0) {
    lines.push(`\n${orphanReport.failedCount} of ${kits} could not be removed.\n`);
  }

  return lines.join('');
}

/** The fields that a compile supplies to a manifest kit entry, with paths stated against the manifest. */
interface KitCompileFields {
  bundledDependencies: Record<string, string>;
  esbuildVersion: string;
  inputs: RdyManifestInput[];
  path: string;
  source: string;
  sourceHash: string;
  targetHash: string;
}

/** The manifest fields supplied by a compile's input closure. */
interface ClosureFields {
  inputs: RdyManifestInput[];
  sourceHash: string;
}

/**
 * Returns the manifest fields supplied by a compile's closure, with paths stated against the manifest.
 *
 * `sourceHash` is the entry's own record rather than a second reading of the file, so the two cannot
 * disagree. A closure holding no record of the entry is a defect in rdy rather than an occasion to hash
 * the file again: Deriving is the point, and hashing separately would restore exactly the disagreement
 * that deriving prevents.
 *
 * The entry is matched by its real path, because esbuild reports the path to which it resolved a module,
 * which differs from the path handed to a compile wherever a directory above it is a symlink.
 */
function deriveClosureFields(inputs: CompiledInput[], entryPath: string, manifestDir: string): ClosureFields {
  const realEntryPath = realpathSync(entryPath);
  const entry = inputs.find((input) => input.kind === 'module' && input.path === realEntryPath);
  if (entry === undefined) {
    throw internalError(`Compile recorded no input for its entry point ${entryPath}`);
  }

  return {
    inputs: inputs.map((input) => relativizeInput(input, manifestDir)),
    sourceHash: entry.hash,
  };
}

/** Returns a recorded input with its path stated relative to the manifest directory, as `path` and `source` are. */
function relativizeInput(input: CompiledInput, manifestDir: string): RdyManifestInput {
  const relativePath = path.relative(manifestDir, input.path);

  return input.kind === 'inline'
    ? { hash: input.hash, kind: 'inline', path: relativePath, paths: input.paths }
    : { hash: input.hash, kind: 'module', path: relativePath };
}

/** Returns the manifest entry recording a compiled kit, omitting each optional field that it has nothing for. */
function buildManifestKit(kitName: string, metadata: KitMetadata, compileFields: KitCompileFields): RdyManifestKit {
  return {
    esbuildVersion: compileFields.esbuildVersion,
    inputs: compileFields.inputs,
    name: kitName,
    path: compileFields.path,
    readyupVersion: VERSION,
    source: compileFields.source,
    sourceHash: compileFields.sourceHash,
    targetHash: compileFields.targetHash,
    ...(Object.keys(compileFields.bundledDependencies).length > 0 && {
      bundledDependencies: compileFields.bundledDependencies,
    }),
    ...(metadata.checklists.length > 0 && { checklists: metadata.checklists }),
    ...(metadata.description !== undefined && { description: metadata.description }),
  };
}

/** Upserts a kit entry into the manifest at `manifestPath`, writing the result back. */
function upsertManifest(
  manifestPath: string,
  kitName: string,
  metadata: KitMetadata,
  compileFields: KitCompileFields,
): void {
  let existingKits: RdyManifestKit[] = [];
  try {
    const existing = readManifest(manifestPath);
    existingKits = existing.kits;
  } catch (error: unknown) {
    // Missing manifest is expected for first compile; other failures should surface.
    if (!(error instanceof ManifestNotFoundError)) {
      const message = describeError(error);
      process.stderr.write(`Warning: ${message}; starting with empty manifest\n`);
    }
  }

  const entry = buildManifestKit(kitName, metadata, compileFields);

  // Replace existing entry for this kit name, or append.
  const filtered = existingKits.filter((k) => k.name !== kitName);
  const kits = [...filtered, entry].toSorted((a, b) => a.name.localeCompare(b.name));

  writeManifest(manifestPath, { version: 1, kits });
}

/**
 * Returns the manifest's kits indexed by name, or an empty index where the manifest is missing.
 *
 * A missing manifest is the normal state of a first compile. Any other failure is written to stderr
 * and leaves the drift gate a no-op.
 */
function loadExistingKitsByName(manifestPath: string): Map<string, RdyManifestKit> {
  const map = new Map<string, RdyManifestKit>();
  try {
    const manifest = readManifest(manifestPath);
    for (const kit of manifest.kits) {
      map.set(kit.name, kit);
    }
  } catch (error: unknown) {
    if (!(error instanceof ManifestNotFoundError)) {
      const message = describeError(error);
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
 * Returns a single kit's drift status alongside the manifest entry to preserve, or `undefined` where
 * the kit should proceed to compile.
 */
function detectDrift(args: DetectDriftArgs): DriftSkip | undefined {
  const { skipManifest, force, existingKit, manifestDir } = args;
  if (skipManifest || force || existingKit === undefined) return undefined;
  const status = checkDrift(existingKit, manifestDir);
  if (status.kind !== 'drift') return undefined;
  return { status, existingKit };
}

/** Returns the name of the kit compiled from a source, which is the source's file name without its extension. */
function deriveKitName(fileName: string): string {
  return path.basename(fileName, '.ts');
}

/** Returns a source's path as a failure names it: against the sweep root in a recursive compile, else against `srcDir`. */
function describeSource(fileName: string, srcDir: string, sweepRoot: string | undefined): string {
  return sweepRoot === undefined ? fileName : path.relative(sweepRoot, path.join(srcDir, fileName));
}

/** Returns each kit name claimed by more than one source, with the sources that claim it in sweep order. */
function findSharedKitNames(fileNames: string[]): Map<string, string[]> {
  const sourcesByKitName = new Map<string, string[]>();
  for (const fileName of fileNames) {
    const kitName = deriveKitName(fileName);
    sourcesByKitName.set(kitName, [...(sourcesByKitName.get(kitName) ?? []), fileName]);
  }
  return new Map([...sourcesByKitName].filter(([, sources]) => sources.length > 1));
}

/** Returns the failure reported for each source that claims a kit name shared with other sources. */
function formatSharedKitNameError(kitName: string, sources: string[]): string {
  const sourceList = new Intl.ListFormat('en', { type: 'conjunction' }).format(sources);
  return `Kit name "${kitName}" is shared by ${sourceList}. Keep one, and rename the others or remove them from the sweep with compile.exclude.`;
}

/** Returns a line naming the output that a rebuilt kit produced, or reporting an unchanged one as skipped. */
function formatResultLine(srcName: string, outName: string, changed: boolean): string {
  if (!changed) {
    return getLayout().formatCheckLine({ token: 'skippedOptional', name: srcName, detail: 'no changes' }) + '\n';
  }

  const claim = getLayout().formatCheckLine({ token: 'passed', name: srcName });
  return `${claim} ${TRANSFORM_ARROW} ${getLayout().inlineGlyph('kit')}${outName}\n`;
}

/** Returns a warning line for a kit, with the hash mismatch from `status` and any further `clause` in a block beneath. */
function formatDriftLine(name: string, status: Extract<DriftStatus, { kind: 'drift' }>, clause?: string): string {
  const target = path.basename(status.resolvedPath);
  const claim = getLayout().formatCheckLine({ token: 'failedWarn', name });
  const mismatch = `drift in ${target}: expected ${status.expected}, got ${status.actual}`;
  const reason = clause === undefined ? mismatch : `${mismatch}; ${clause}`;

  return [claim, ...getLayout().formatReasonBlock([reason])].join('\n') + '\n';
}

/** Kinds of kit among those that a sweep left alone because their bundles drifted. */
interface DriftedKitKinds {
  /** A kit that no source compiles to any longer. */
  hasOrphan: boolean;
  /** A kit compiled from a source that the sweep found. */
  hasSourced: boolean;
}

/** Returns what to do about a sweep's drifted kits, where an orphan has no source into which to move its edits. */
function formatDriftRemedy({ hasOrphan, hasSourced }: DriftedKitKinds): string {
  if (!hasOrphan) return 'Re-run with --force to overwrite, or move edits into the source.';
  if (!hasSourced) return 'Re-run with --force to remove, or restore the source.';
  return 'Re-run with --force to overwrite or remove, or move edits into the source.';
}

/** Returns a line reporting a bundle removed because no source compiles to it. */
function formatRemovalLine(bundleName: string): string {
  return (
    getLayout().formatCheckLine({ token: 'passed', name: bundleName, detail: `removed, ${NO_SOURCE_CLAUSE}` }) + '\n'
  );
}

/** Returns a section heading as a single writable string, newline-terminated. */
function formatSectionHeading(label: string): string {
  return `${getLayout().formatHeading(label, 'section')}\n`;
}

/**
 * Returns the clause naming what a sweep that found no kits did with the manifest.
 *
 * Empty under `--skip-manifest`, where the manifest was never consulted and so has nothing to report. A written
 * manifest lists no kits unless an orphan kept its entry.
 */
function formatManifestOutcome(skipManifest: boolean, writesManifest: boolean, entryCount: number): string {
  if (skipManifest) return '';
  if (!writesManifest) return '; manifest not written';
  return `; manifest now lists ${entryCount === 0 ? 'no kits' : pluralizeWithCount(entryCount, 'kit')}`;
}

/**
 * Returns the directory against which a compile heading names its paths.
 *
 * The nearest enclosing workspace root wins, then the nearest repository root, then `fallbackDir`.
 * `pnpm -r exec rdy compile` gives each workspace its own working directory, so naming paths against
 * that one would head every workspace's output identically and leave the reader unable to tell whose
 * kits a line reports. A repository with no workspace file still gets a stable anchor.
 */
function resolveWorkspaceAnchor(srcDir: string, fallbackDir: string): string {
  const markers = ['pnpm-workspace.yaml', '.git'];

  for (const marker of markers) {
    let directory = srcDir;
    while (directory !== path.dirname(directory)) {
      if (existsSync(path.join(directory, marker))) return directory;
      directory = path.dirname(directory);
    }
  }

  return fallbackDir;
}
