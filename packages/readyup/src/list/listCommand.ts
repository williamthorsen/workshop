import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { EXIT_OK } from '../bin/exitCodes.ts';
import { discoverKitPackages } from '../check-utils/discoverKitPackages.ts';
import { collectSourceKitNames } from '../compile/collectSourceKitNames.ts';
import { DEFAULT_CONFIG, loadConfig } from '../config/loadConfig.ts';
import { extractHint } from '../errors/error-handling.ts';
import { translateParseArgsError } from '../errors/parse-args-error.ts';
import { configError, usageError } from '../errors/RdyError.ts';
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
import { createRemoteFetchContext, type RemoteFetchContext } from '../remote/createRemoteFetchContext.ts';
import { type JsonListKitEntry, type JsonListOutput, SCHEMA_VERSION } from '../schemas/listOutputSchema.ts';
import { collectSourceGroups } from '../sources/collectSourceGroups.ts';
import { expandConfiguredSource, type SourceKit } from '../sources/expandConfiguredSources.ts';
import type { ConfiguredSource } from '../sources/parseConfiguredSource.ts';
import { buildManifestEntry } from './buildManifestEntry.ts';
import { collectCompiledKits } from './collectCompiledKits.ts';
import { collectSourceKits } from './collectSourceKits.ts';
import { enumerateKits } from './enumerateKits.ts';
import {
  formatConsumerView,
  formatManifestView,
  formatOwnerView,
  formatRecursiveSourcesView,
  formatRecursiveView,
  formatSourcesView,
  type ProjectSourcesView,
  type RecursiveProjectView,
  resolveCompiledStyle,
} from './formatList.ts';

const listOptions = {
  config: { type: 'string' },
  from: { type: 'string' },
  json: { type: 'boolean' },
  manifest: { type: 'string' },
  'no-cache': { type: 'boolean' },
  recursive: { type: 'boolean' },
  sources: { type: 'boolean' },
  // Declared so that strict parsing accepts it; `routeCommand` consumed its value before dispatch.
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
  const { positionals, values } = parsed;

  if (positionals.length > 0) {
    throw usageError('rdy list does not accept positional arguments.');
  }

  for (const [name, value] of Object.entries(values)) {
    if (value === '') {
      throw usageError(`--${name} requires a value`);
    }
  }

  const configArg = values.config;
  const fromArg = values.from;
  const json = values.json === true;
  const manifestArg = values.manifest;
  const sources = values.sources === true;
  const recursive = values.recursive === true;

  rejectConflictingFlags({ configArg, fromArg, manifestArg, recursive, sources });
  const noCache = values['no-cache'] === true;

  // The pair composes rather than conflicting: locality from one flag, provenance from the other.
  if (sources && recursive) {
    return runRecursiveSourcesMode(json, createRemoteFetchContext({ reload: noCache }));
  }

  if (recursive) {
    return runRecursiveMode(json);
  }

  if (manifestArg !== undefined) {
    return runManifestMode(manifestArg, json);
  }

  if (fromArg !== undefined) {
    return runFromMode(fromArg, json, noCache);
  }

  if (sources) {
    return runSourcesMode(json, configArg, createRemoteFetchContext({ reload: noCache }));
  }

  return runOwnerMode(json, configArg, createRemoteFetchContext({ reload: noCache }));
}

/** The `list` flags whose combinations are constrained. */
interface ListFlagConstraints {
  configArg: string | undefined;
  fromArg: string | undefined;
  manifestArg: string | undefined;
  sources: boolean;
  recursive: boolean;
}

/**
 * Rejects a combination of flags naming listings that cannot be produced together, or naming a config that the
 * listing would not read.
 */
function rejectConflictingFlags({ configArg, fromArg, manifestArg, recursive, sources }: ListFlagConstraints): void {
  if (fromArg !== undefined && manifestArg !== undefined) {
    throw usageError('--from and --manifest are mutually exclusive');
  }

  // `--recursive` sweeps this tree, while the other two name a single foreign source.
  if (recursive && fromArg !== undefined) {
    throw usageError('--recursive and --from are mutually exclusive');
  }

  if (recursive && manifestArg !== undefined) {
    throw usageError('--recursive and --manifest are mutually exclusive');
  }

  // `--sources` reports this directory's dependencies and configured sources, which no foreign source has.
  if (sources && fromArg !== undefined) {
    throw usageError('--sources and --from are mutually exclusive');
  }

  if (sources && manifestArg !== undefined) {
    throw usageError('--sources and --manifest are mutually exclusive');
  }

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

/** Displays the kits in a `--from` source. */
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
      ? formatManifestView({ fromArg, kits: sourceKits.kits, manifestPath: sourceKits.manifestUrl })
      : formatConsumerView({
          compiledKits: sourceKits.kits.map(({ name, checklists }) => ({ name, checklists })),
          fromArg,
          kitsDir: path.relative(process.cwd(), sourceKits.kitsDir) || '.',
        });
  writeHuman(output + '\n', json);

  return finishList(sourceKits.kits, json);
}

/** Enumerates the kits named by the project config. */
async function runOwnerMode(
  json: boolean,
  configPath: string | undefined,
  remote: RemoteFetchContext,
): Promise<number> {
  const cwd = process.cwd();
  const config = await loadListingConfig(configPath);

  const srcDir = path.resolve(cwd, config.compile.srcDir);
  const internalDir = path.join(srcDir, config.internal.dir);
  const internalExtension = config.internal.infix !== undefined ? `.${config.internal.infix}.ts` : '.ts';
  // Without either key `--internal` resolves a name exactly as plain `--jit` does, so the bucket is the
  // source selection and rows for it would restate the source rows.
  const needsInternalFlag = config.internal.dir !== '.' || config.internal.infix !== undefined;

  let sourceKits;
  let internalKits;
  let compiledEntries;
  try {
    sourceKits = collectSourceKitNames(srcDir, config.compile);
    internalKits = needsInternalFlag
      ? enumerateKits({ dir: internalDir, extension: internalExtension, recursive: false })
      : [];
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

  const configuredKits = await collectConfiguredSourceKits(config.sources, remote);
  const configuredSpellings = new Set(config.sources.map((configured) => configured.spelling));
  const availableSources = discoverKitPackages(cwd)
    .map((name) => `npm:${name}`)
    .filter((spelling) => !configuredSpellings.has(spelling) && !config.omittedSources.includes(spelling));

  const compiledKits = compiledEntries.map(({ name, checklists }) => ({ name, checklists }));
  writeHuman(
    formatOwnerView({
      sourceKits,
      internalKits,
      compiledKits,
      configuredKits: configuredKits.map((kit) => ({
        name: describeSourceKit(kit),
        checklists: kit.checklists,
        sourceKind: kit.provenance.kind === 'repository' ? 'repository' : 'package',
      })),
      availableSources,
    }) + '\n',
    json,
  );

  const entries: JsonListKitEntry[] = [
    ...sourceKits.map((name) => buildSourceEntry(name, srcDir, '.ts', false)),
    ...internalKits.map((name) => buildSourceEntry(name, internalDir, internalExtension, true)),
    ...compiledEntries,
    ...configuredKits.map((kit) => buildSourceKitEntry(kit, true)),
  ];
  return finishList(entries, json, availableSources);
}

/**
 * Enumerates every kit source available to the working directory, with the kits that each publishes.
 *
 * The dependency axis alone: A project's own kits belong to the owner listing, and this view reports what
 * the project's sources offer rather than what it contains. Both the packages named by the config and the
 * ones that it omits are reported, since the question is what is available rather than what a run would select,
 * and so is every repository that the config names.
 */
async function runSourcesMode(
  json: boolean,
  configPath: string | undefined,
  remote: RemoteFetchContext,
): Promise<number> {
  const config = await loadListingConfig(configPath);
  const groups = await collectSourceGroups({ configuredSources: config.sources, fromDir: process.cwd(), remote });

  writeHuman(formatSourcesView({ groups }) + '\n', json);

  return finishList(
    groups.flatMap((group) => group.kits.map((kit) => buildSourceKitEntry(kit, group.configured))),
    json,
  );
}

/**
 * Enumerates the kit sources of every project below the working directory.
 *
 * Both axes at once: The locality named by `--recursive` and the provenance named by `--sources`. The sweep
 * is every project rather than every kit project, because a workspace authoring no kits of its own still
 * declares dependencies that publish them, and that workspace is the one that the question is about.
 *
 * Each project's sources are read under its own config, so a source that one workspace configures and
 * another does not is reported as configured only for the workspace that configures it. A repository that several
 * projects name, and that cannot be fetched, is warned of once per project naming it.
 */
async function runRecursiveSourcesMode(json: boolean, remote: RemoteFetchContext): Promise<number> {
  const projects = await discoverProjects({ root: process.cwd() });
  warnOfDefaultedConfigs(projects);

  const views: ProjectSourcesView[] = [];
  const entries: JsonListKitEntry[] = [];

  for (const project of projects) {
    const groups = await collectSourceGroups({
      configuredSources: project.config.sources,
      fromDir: project.absolutePath,
      remote,
    });

    views.push({ dir: project.dir, groups });
    entries.push(
      ...groups.flatMap((group) => group.kits.map((kit) => buildSourceKitEntry(kit, group.configured, project.dir))),
    );
  }

  writeHuman(formatRecursiveSourcesView({ projects: views }) + '\n', json);

  return finishList(entries, json);
}

/**
 * Enumerates the compiled kits of every kit project below the working directory.
 *
 * Compiled kits only: An internal kit is never reachable from another directory, since `--jit` and
 * `--internal` reject every source flag, and a configured package's kits belong to the dependency axis.
 * What is left is exactly the set that a reader can run from the working directory.
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
      compiledKits: kits.map(({ name, description, checklists }) => ({ name, description, checklists })),
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
 * For a project whose manifest nobody can read, the listing omits the descriptions but keeps the kits: The kits
 * themselves are still on disk. A project whose output directory cannot be read is omitted, and the sweep moves on.
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
 * Collects the kits published by the configured sources, tolerating one that cannot be expanded.
 *
 * `run` fails hard on the same configuration, because it would otherwise execute against a source set that
 * nobody chose. Listing is read-only, so it takes the warn-and-continue that the corrupt-manifest path above
 * already takes: A reader asking what exists is better served by the rest of the answer than by none.
 */
async function collectConfiguredSourceKits(
  sources: readonly ConfiguredSource[],
  remote: RemoteFetchContext,
): Promise<SourceKit[]> {
  const expanded = await Promise.all(
    sources.map(async (configured) => {
      try {
        return await expandConfiguredSource(configured, '.js', remote);
      } catch (error: unknown) {
        process.stderr.write(`Warning: ${describeError(error)}\n`);
        return [];
      }
    }),
  );
  return expanded.flat();
}

/**
 * Labels a source kit, its source first, to match the heading that a run gives it.
 *
 * The row's own token supplies the package or repository glyph; the label contains only what follows it.
 */
function describeSourceKit(kit: SourceKit): string {
  const version = kit.version === undefined ? '' : `@${kit.version}`;
  const label = kit.provenance.kind === 'package' ? `${kit.provenance.packageName}${version}` : kit.source;
  return `${label}${SEGMENT_SEPARATOR}${getLayout().inlineGlyph('kit')}${kit.kitName}`;
}

/**
 * Builds the row for a kit published by a source, recording whether the config names that source.
 *
 * `project` names the directory whose sources were read. Pass `undefined` for a listing that reads one
 * project, and the sweep-relative directory for a repo-wide one, in which two workspaces naming the same
 * source each contribute a row. A repository kit has no path on this machine, so its row has none.
 */
function buildSourceKitEntry(kit: SourceKit, configured: boolean, project?: string): JsonListKitEntry {
  return {
    name: kit.kitName,
    kind: 'compiled',
    ...(project !== undefined && { project }),
    origin: {
      source: kit.source,
      ...(kit.version !== undefined && { version: kit.version }),
      configured,
    },
    ...('path' in kit.location && { path: kit.location.path }),
    ...(kit.description !== undefined && { description: kit.description }),
    ...(kit.checklists !== undefined && { checklists: kit.checklists }),
  };
}

/**
 * Loads the project config or the one named by `--config`, falling back to the defaults and reporting a
 * config that it cannot load.
 *
 * Listing is read-only, so when a config cannot be evaluated, the function drops the caller's settings rather
 * than the whole listing, taking the same warn-and-continue that the corrupt-manifest paths take. `run` still fails
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
function finishList(kits: JsonListKitEntry[], json: boolean, availableSources: string[] = []): number {
  if (json) {
    const output: JsonListOutput = {
      schemaVersion: SCHEMA_VERSION,
      kits,
      ...(availableSources.length > 0 && { availableSources }),
    };
    process.stdout.write(JSON.stringify(output) + '\n');
  }
  return EXIT_OK;
}

/** Returns a kit row for a TypeScript source awaiting compilation, recording whether `--internal` reaches it. */
function buildSourceEntry(name: string, dir: string, extension: string, internal: boolean): JsonListKitEntry {
  return {
    name,
    kind: 'internal',
    internal,
    path: path.relative(process.cwd(), path.join(dir, `${name}${extension}`)),
  };
}

/** Reads a manifest, reporting an unreadable or invalid one as a config failure. */
function readManifestOrThrow(manifestPath: string): RdyManifest {
  try {
    return readManifest(manifestPath);
  } catch (error: unknown) {
    throw configError(describeError(error), { cause: error });
  }
}
