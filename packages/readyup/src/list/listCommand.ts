import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { EXIT_OK } from '../bin/exitCodes.ts';
import { discoverKitPackages } from '../check-utils/discoverKitPackages.ts';
import { DEFAULT_CONFIG, loadConfig } from '../config/loadConfig.ts';
import { extractHint } from '../errors/error-handling.ts';
import { translateParseArgsError } from '../errors/parse-args-error.ts';
import { configError, usageError } from '../errors/RdyError.ts';
import { collectKitPackageGroups } from '../installed-packages/collectKitPackageGroups.ts';
import { expandConfiguredPackages, type PackageKit } from '../installed-packages/expandConfiguredPackages.ts';
import { KITS_DIR } from '../kits/kitsDir.ts';
import { parseFromValue } from '../kits/parseFromValue.ts';
import type { ResolvedRdyConfig } from '../kits/types.ts';
import { getLayout } from '../layout/engine.ts';
import { SEGMENT_SEPARATOR } from '../layout/layoutEngine.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RdyManifest } from '../manifest/manifestSchema.ts';
import { readManifest } from '../manifest/readManifest.ts';
import { writeHuman } from '../output/writeHuman.ts';
import { isSkippableFilesystemError } from '../portable/isSkippableFilesystemError.ts';
import { discoverKitProjects, discoverProjects, type Project } from '../projects/project-discovery.ts';
import { createRemoteFetchContext } from '../remote/createRemoteFetchContext.ts';
import { type JsonListKitEntry, type JsonListOutput, SCHEMA_VERSION } from '../schemas/listOutputSchema.ts';
import { buildManifestEntry } from './buildManifestEntry.ts';
import { collectCompiledKits } from './collectCompiledKits.ts';
import { collectSourceKits } from './collectSourceKits.ts';
import { enumerateKits } from './enumerateKits.ts';
import {
  formatConsumerView,
  formatManifestView,
  formatOwnerView,
  formatPackagesView,
  formatRecursivePackagesView,
  formatRecursiveView,
  type ProjectPackagesView,
  type RecursiveProjectView,
  resolveCompiledStyle,
} from './formatList.ts';

const listOptions = {
  config: { type: 'string' },
  from: { type: 'string' },
  json: { type: 'boolean' },
  manifest: { type: 'string' },
  'no-cache': { type: 'boolean' },
  packages: { type: 'boolean' },
  recursive: { type: 'boolean' },
  // Declared so strict parsing accepts it; `routeCommand` consumed its value before dispatch.
  style: { type: 'string' },
} as const;

/** Runs the `list` subcommand, returning the exit code produced by its enumeration of manifest and filesystem kits. */
export async function listCommand(args: string[]): Promise<number> {
  let parsed;
  try {
    parsed = nodeParseArgs({ args, options: listOptions, strict: true, allowPositionals: true });
  } catch (error: unknown) {
    throw usageError(translateParseArgsError(error, 'list'), { cause: error });
  }
  const { values } = parsed;

  for (const [name, value] of Object.entries(values)) {
    if (value === '') {
      throw usageError(`--${name} requires a value`);
    }
  }

  const fromArg = values.from;
  const json = values.json === true;
  const manifestArg = values.manifest;

  if (fromArg !== undefined && manifestArg !== undefined) {
    throw usageError('--from and --manifest are mutually exclusive');
  }

  const packages = values.packages === true;
  const recursive = values.recursive === true;

  // `--recursive` sweeps this tree, while the other two name a single foreign source.
  if (recursive && fromArg !== undefined) {
    throw usageError('--recursive and --from are mutually exclusive');
  }

  if (recursive && manifestArg !== undefined) {
    throw usageError('--recursive and --manifest are mutually exclusive');
  }

  // `--packages` reports this directory's dependencies, which no foreign source has.
  if (packages && fromArg !== undefined) {
    throw usageError('--packages and --from are mutually exclusive');
  }

  if (packages && manifestArg !== undefined) {
    throw usageError('--packages and --manifest are mutually exclusive');
  }

  const configArg = values.config;

  // A sweep reads each project's own config and a foreign source reads none, so neither has a use for `--config`.
  if (recursive && configArg !== undefined) {
    throw usageError('--recursive and --config are mutually exclusive');
  }

  if (configArg !== undefined && fromArg !== undefined) {
    throw usageError('--config and --from are mutually exclusive');
  }

  if (configArg !== undefined && manifestArg !== undefined) {
    throw usageError('--config and --manifest are mutually exclusive');
  }

  // The pair composes rather than conflicting: locality from one flag, provenance from the other.
  if (packages && recursive) {
    return runRecursivePackagesMode(json);
  }

  if (recursive) {
    return runRecursiveMode(json);
  }

  if (manifestArg !== undefined) {
    return runManifestMode(manifestArg, json);
  }

  if (fromArg !== undefined) {
    return runFromMode(fromArg, json, values['no-cache'] === true);
  }

  if (packages) {
    return runPackagesMode(json, configArg);
  }

  return runOwnerMode(json, configArg);
}

/** Displays the kits declared by a manifest file. */
function runManifestMode(manifestArg: string, json: boolean): number {
  const manifestPath = path.resolve(process.cwd(), manifestArg);
  const manifest = readManifestOrThrow(manifestPath);

  const relPath = path.relative(process.cwd(), manifestPath);
  writeHuman(formatManifestView({ kits: manifest.kits, manifestPath: relPath }) + '\n', json);

  return finishList(
    manifest.kits.map((kit) => buildManifestEntry(kit, path.dirname(manifestPath))),
    json,
  );
}

/** Displays the kits held by a `--from` source. */
async function runFromMode(fromArg: string, json: boolean, noCache: boolean): Promise<number> {
  let source;
  try {
    source = parseFromValue(fromArg);
  } catch (error: unknown) {
    throw usageError(describeError(error), { cause: error });
  }

  const sourceKits = await collectSourceKits(source, createRemoteFetchContext({ reload: noCache }));

  const output =
    sourceKits.kind === 'remote'
      ? formatManifestView({ kits: sourceKits.kits, manifestPath: sourceKits.manifestUrl })
      : formatConsumerView({
          compiledKits: sourceKits.kits.map((kit) => kit.name),
          fromArg,
          kitsDir: path.relative(process.cwd(), sourceKits.kitsDir) || '.',
        });
  writeHuman(output + '\n', json);

  return finishList(sourceKits.kits, json);
}

/** Enumerates the kits named by the project config. */
async function runOwnerMode(json: boolean, configPath: string | undefined): Promise<number> {
  const cwd = process.cwd();
  const config = await loadListingConfig(configPath);

  const internalDir = path.join(cwd, KITS_DIR, config.internal.dir);
  const internalExtension = config.internal.infix !== undefined ? `.${config.internal.infix}.ts` : '.ts';

  let internalKits;
  let compiledEntries;
  try {
    internalKits = enumerateKits({ dir: internalDir, extension: internalExtension });
    // A missing manifest is the normal state of a project that never compiled, and says nothing on its own: The
    // empty-listing hint belongs to the view, which sees the package sections too.
    compiledEntries = collectCompiledKits({
      manifestPath: path.resolve(cwd, DEFAULT_MANIFEST_PATH),
      onUnreadableManifest: warnOfUnreadableManifest,
      outDir: path.resolve(cwd, config.compile.outDir),
    });
  } catch (error: unknown) {
    throw configError(describeError(error), { cause: error });
  }

  const packageKits = collectConfiguredPackageKits(config.packages);
  const availablePackages = discoverKitPackages(cwd).filter((name) => !config.packages.includes(name));

  const compiledKits = compiledEntries.map((kit) => kit.name);
  const compiledStyle = resolveCompiledStyle(cwd, config.compile.outDir, cwd);
  const needsInternalFlag = config.internal.dir !== '.' || config.internal.infix !== undefined;
  writeHuman(
    formatOwnerView({
      internalKits,
      compiledKits,
      compiledStyle,
      needsInternalFlag,
      packageKits: packageKits.map(describePackageKit),
      availablePackages,
    }) + '\n',
    json,
  );

  const entries: JsonListKitEntry[] = [
    ...internalKits.map((name) => buildInternalEntry(name, internalDir, internalExtension)),
    ...compiledEntries,
    ...packageKits.map((kit) => buildPackageEntry(kit, true)),
  ];
  return finishList(entries, json, availablePackages);
}

/**
 * Enumerates every kit-publishing dependency of the working directory, with the kits that each publishes.
 *
 * The dependency axis alone: A project's own kits belong to the owner listing, and this view reports what
 * the project's dependencies offer rather than what it holds. Both the packages named by the config and the
 * ones that it omits are reported, since the question is what is available rather than what a run would select.
 */
async function runPackagesMode(json: boolean, configPath: string | undefined): Promise<number> {
  const config = await loadListingConfig(configPath);
  const groups = collectKitPackageGroups({ configuredPackages: config.packages, fromDir: process.cwd() });

  writeHuman(formatPackagesView({ groups }) + '\n', json);

  return finishList(
    groups.flatMap((group) => group.kits.map((kit) => buildPackageEntry(kit, group.configured))),
    json,
  );
}

/**
 * Enumerates the kit-publishing dependencies of every project below the working directory.
 *
 * Both axes at once: The locality named by `--recursive` and the provenance named by `--packages`. The sweep
 * is every project rather than every kit project, because a workspace authoring no kits of its own still
 * declares dependencies that publish them, and that workspace is the one that the question is about.
 *
 * Each project's dependencies are read under its own config, so a package that one workspace configures and
 * another does not is reported as configured where it is.
 */
async function runRecursivePackagesMode(json: boolean): Promise<number> {
  const projects = await discoverProjects({ root: process.cwd() });
  warnOfDefaultedConfigs(projects);

  const views: ProjectPackagesView[] = [];
  const entries: JsonListKitEntry[] = [];

  for (const project of projects) {
    const groups = collectKitPackageGroups({
      configuredPackages: project.config.packages,
      fromDir: project.absolutePath,
    });

    views.push({ dir: project.dir, groups });
    entries.push(
      ...groups.flatMap((group) => group.kits.map((kit) => buildPackageEntry(kit, group.configured, project.dir))),
    );
  }

  writeHuman(formatRecursivePackagesView({ projects: views }) + '\n', json);

  return finishList(entries, json);
}

/**
 * Enumerates the compiled kits of every kit project below the working directory.
 *
 * Compiled kits only: An internal kit is never reachable from another directory, since `--jit` and
 * `--internal` reject every source flag, and a configured package's kits belong to the dependency axis.
 * What is left is exactly the set that a reader can run from where they stand.
 */
async function runRecursiveMode(json: boolean): Promise<number> {
  const root = process.cwd();
  const projects = await discoverKitProjects({ root });
  warnOfDefaultedConfigs(projects);

  const views: RecursiveProjectView[] = [];
  const entries: JsonListKitEntry[] = [];

  for (const project of projects) {
    const kits = collectProjectKits(project);
    views.push({
      dir: project.dir,
      compiledKits: kits.map((kit) => ({ name: kit.name, description: kit.description })),
      compiledStyle: resolveCompiledStyle(project.absolutePath, project.config.compile.outDir, root),
    });
    entries.push(...kits);
  }

  writeHuman(formatRecursiveView({ projects: views }) + '\n', json);

  return finishList(entries, json);
}

/**
 * Reads one project's compiled kits for a repo-wide listing.
 *
 * A manifest that nobody can read drops that project's descriptions, not its listing: The kits themselves
 * are still on disk. An output directory that cannot be read drops the project, and the sweep moves on.
 */
function collectProjectKits(project: Project): JsonListKitEntry[] {
  const outDir = path.resolve(project.absolutePath, project.config.compile.outDir);

  try {
    return collectCompiledKits({
      manifestPath: project.manifestPath,
      onUnreadableManifest: warnOfUnreadableManifest,
      outDir,
      project: project.dir,
    });
  } catch (error: unknown) {
    if (!isSkippableFilesystemError(error)) throw error;
    process.stderr.write(`Warning: Cannot read ${outDir}. Omitting ${project.dir} from the listing.\n`);
    return [];
  }
}

/**
 * Collects the kits published by the configured packages, tolerating one that cannot be expanded.
 *
 * `run` fails hard on the same configuration, because it would otherwise execute against a package set that
 * nobody chose. Listing is read-only, so it takes the warn-and-continue that the corrupt-manifest path above
 * already takes: A reader asking what exists is better served by the rest of the answer than by none.
 */
function collectConfiguredPackageKits(packageNames: string[]): PackageKit[] {
  return packageNames.flatMap((packageName) => {
    try {
      return expandConfiguredPackages([packageName], '.js');
    } catch (error: unknown) {
      process.stderr.write(`Warning: ${describeError(error)}\n`);
      return [];
    }
  });
}

/**
 * Labels a package kit, its package first, so a kit reads the same here as in the heading that a run gives it.
 *
 * The row's own token supplies the package glyph, so the label holds only what follows it.
 */
function describePackageKit(kit: PackageKit): string {
  const version = kit.version === undefined ? '' : `@${kit.version}`;
  return `${kit.packageName}${version}${SEGMENT_SEPARATOR}${getLayout().inlineGlyph('kit')}${kit.kitName}`;
}

/**
 * Builds the row for a kit published by an installed package, recording whether the config names it.
 *
 * `project` names the directory whose dependencies were read. Pass `undefined` for a listing that reads
 * one project, and the sweep-relative directory for a repo-wide one, where two workspaces depending on
 * the same package each contribute a row.
 */
function buildPackageEntry(kit: PackageKit, configured: boolean, project?: string): JsonListKitEntry {
  return {
    name: kit.kitName,
    kind: 'compiled',
    ...(project !== undefined && { project }),
    origin: {
      package: kit.packageName,
      ...(kit.version !== undefined && { version: kit.version }),
      configured,
    },
    path: kit.path,
    ...(kit.description !== undefined && { description: kit.description }),
  };
}

/**
 * Loads the project config or the one named by `--config`, falling back to the defaults and reporting a
 * config that it cannot load.
 *
 * Listing is read-only, so a config that cannot be evaluated drops the caller's settings rather than the
 * whole listing, taking the same warn-and-continue that the corrupt-manifest paths take. `run` still fails
 * hard on the same failure: It would otherwise execute against settings that nobody chose.
 */
async function loadListingConfig(configPath: string | undefined): Promise<ResolvedRdyConfig> {
  try {
    return await loadConfig({ ...(configPath !== undefined && { overridePath: configPath }) });
  } catch (error: unknown) {
    const detail = describeError(error).replace(/\.$/, '');
    process.stderr.write(`Warning: ${detail}. Listing with default settings.\n`);
    const hint = extractHint(error);
    if (hint !== undefined) process.stderr.write(getLayout().formatHint(hint) + '\n');
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Warns of each swept project whose config could not be evaluated, which the listing reads with default settings.
 *
 * Listing is read-only, so it takes the same warn-and-continue that `loadListingConfig` takes for the working directory.
 */
function warnOfDefaultedConfigs(projects: Project[]): void {
  for (const { configError, dir } of projects) {
    if (configError === undefined) continue;
    const detail = describeError(configError).replace(/\.$/, '');
    process.stderr.write(`Warning: ${detail}. Reading ${dir} with default settings.\n`);
  }
}

/** Warns of a manifest that exists and cannot be read, whose kits the listing then reads from disk. */
function warnOfUnreadableManifest(error: unknown): void {
  process.stderr.write(`Warning: ${describeError(error)}\n`);
}

/** Emits the list payload under `--json`, succeeding whenever the listing's source could be read. */
function finishList(kits: JsonListKitEntry[], json: boolean, availablePackages: string[] = []): number {
  if (json) {
    const output: JsonListOutput = {
      schemaVersion: SCHEMA_VERSION,
      kits,
      ...(availablePackages.length > 0 && { availablePackages }),
    };
    process.stdout.write(JSON.stringify(output) + '\n');
  }
  return EXIT_OK;
}

/** Returns a kit row for a TypeScript source awaiting compilation. */
function buildInternalEntry(name: string, dir: string, extension: string): JsonListKitEntry {
  return { name, kind: 'internal', path: path.relative(process.cwd(), path.join(dir, `${name}${extension}`)) };
}

/** Reads a manifest, reporting an unreadable or invalid one as a config failure. */
function readManifestOrThrow(manifestPath: string): RdyManifest {
  try {
    return readManifest(manifestPath);
  } catch (error: unknown) {
    throw configError(describeError(error), { cause: error });
  }
}
