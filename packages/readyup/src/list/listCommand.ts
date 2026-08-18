import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { EXIT_OK } from '../bin/exitCodes.ts';
import { discoverKitPackages } from '../check-utils/discoverKitPackages.ts';
import { DEFAULT_CONFIG, loadConfig } from '../config/loadConfig.ts';
import { extractHint } from '../errors/error-handling.ts';
import { translateParseArgsError } from '../errors/parse-args-error.ts';
import { configError, kitLoadError, usageError } from '../errors/RdyError.ts';
import { collectKitPackageGroups } from '../installed-packages/collectKitPackageGroups.ts';
import { expandConfiguredPackages, type PackageKit } from '../installed-packages/expandConfiguredPackages.ts';
import { resolvePackageRoot } from '../installed-packages/resolvePackageRoot.ts';
import { KITS_DIR, resolveHomeDir } from '../kits/kitsDir.ts';
import type { DirectorySource, GlobalSource, LocalSource, NpmSource } from '../kits/parseFromValue.ts';
import { parseFromValue } from '../kits/parseFromValue.ts';
import type { ResolvedRdyConfig } from '../kits/types.ts';
import { getLayout } from '../layout/engine.ts';
import { SEGMENT_SEPARATOR } from '../layout/layoutEngine.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RdyManifest, RdyManifestKit } from '../manifest/manifestSchema.ts';
import { ManifestNotFoundError, readManifest } from '../manifest/readManifest.ts';
import { writeHuman } from '../output/writeHuman.ts';
import { isSkippableFilesystemError } from '../portable/isSkippableFilesystemError.ts';
import type { KitProject } from '../projects/discoverKitProjects.ts';
import { discoverKitProjects } from '../projects/discoverKitProjects.ts';
import { loadRemoteManifest } from '../remote/loadRemoteManifest.ts';
import { resolveRemoteAuthHeaders, resolveRemoteProvider } from '../remote/remote-provider.ts';
import { toRemoteRdyError } from '../remote/toRemoteRdyError.ts';
import { type JsonListKitEntry, type JsonListOutput, SCHEMA_VERSION } from '../schemas/listOutputSchema.ts';
import { enumerateKits } from './enumerateKits.ts';
import type { RecursiveProjectView } from './formatList.ts';
import {
  formatConsumerView,
  formatManifestView,
  formatOwnerView,
  formatPackagesView,
  formatRecursiveView,
  resolveCompiledStyle,
} from './formatList.ts';

/** A local `--from` source, which resolves to a directory on this machine. */
type LocalFromSource = DirectorySource | GlobalSource | LocalSource;

const listOptions = {
  from: { type: 'string' },
  json: { type: 'boolean' },
  manifest: { type: 'string' },
  packages: { type: 'boolean' },
  recursive: { type: 'boolean' },
  // Declared so strict parsing accepts it; `routeCommand` consumed its value before dispatch.
  style: { type: 'string' },
} as const;

/**
 * Handle the `list` subcommand: enumerate kits from the manifest and filesystem, then print their names.
 *
 * Returns a numeric exit code.
 */
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

  // Not exclusivity: the pair names the repo-wide dependency view, which nothing implements yet. Saying
  // so keeps the reader from reading a limit as a rule.
  if (packages && recursive) {
    throw usageError('Listing dependencies across a whole repository is not supported yet: "--recursive --packages".');
  }

  if (recursive) {
    return runRecursiveMode(json);
  }

  if (manifestArg !== undefined) {
    return runManifestMode(manifestArg, json);
  }

  if (fromArg !== undefined) {
    return runFromMode(fromArg, json);
  }

  if (packages) {
    return runPackagesMode(json);
  }

  return runOwnerMode(json);
}

/** Display kits from a manifest file. */
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

/** Resolve the manifest path for a `--from` source and display its kits. */
async function runFromMode(fromArg: string, json: boolean): Promise<number> {
  let source;
  try {
    source = parseFromValue(fromArg);
  } catch (error: unknown) {
    throw usageError(describeError(error), { cause: error });
  }

  if (source.type === 'github') {
    const url = `https://raw.githubusercontent.com/${source.org}/${source.repo}/${source.ref}/.readyup/manifest.json`;
    return runRemoteFromMode({ url, json });
  }

  if (source.type === 'bitbucket') {
    const url = `https://api.bitbucket.org/2.0/repositories/${source.workspace}/${source.repo}/src/${source.ref}/.readyup/manifest.json`;
    return runRemoteFromMode({ url, json });
  }

  if (source.type === 'npm') {
    const root = resolveListedPackageRoot(source);
    return listLocalDirectory(path.join(root, DEFAULT_MANIFEST_PATH), path.join(root, KITS_DIR), fromArg, json);
  }

  return listLocalDirectory(resolveFromManifestPath(source), resolveFromKitsDir(source), fromArg, json);
}

/**
 * Locates the package a `list --from npm:` names, rejecting what `run` rejects for the same source.
 *
 * Listing and running answer about the same kits, so a spelling one accepts and the other refuses would
 * send the reader looking for a difference that does not exist.
 */
function resolveListedPackageRoot(source: NpmSource): string {
  if (source.versionSpec !== undefined) {
    throw usageError(
      `Listing a published version is not supported yet: "npm:${source.name}@${source.versionSpec}". ` +
        'Drop the version to list the installed copy.',
    );
  }

  const root = resolvePackageRoot(source.name);
  if (root === undefined) {
    throw kitLoadError(`Package "${source.name}" is not installed; it must be a direct dependency of this project.`);
  }
  return root;
}

/** Displays the kits a directory holds, preferring its manifest and falling back to the files on disk. */
function listLocalDirectory(manifestPath: string, kitsDir: string, fromArg: string, json: boolean): number {
  const manifest = readLocalManifestIfPresent(manifestPath);
  const entries =
    manifest === undefined ? enumerateCompiledKits(kitsDir, manifestPath) : manifestEntries(manifest, manifestPath);

  const output = formatConsumerView({
    compiledKits: entries.map((entry) => entry.name),
    fromArg,
    kitsDir: path.relative(process.cwd(), kitsDir) || '.',
  });
  writeHuman(output + '\n', json);

  return finishList(entries, json);
}

/** Fetch and display kits from a remote manifest URL, authenticating where the host is one readyup knows. */
async function runRemoteFromMode({ url, json }: { url: string; json: boolean }): Promise<number> {
  const provider = resolveRemoteProvider(url);
  const headers = resolveRemoteAuthHeaders(provider);

  let manifest;
  try {
    manifest = await loadRemoteManifest({ url, headers });
  } catch (error: unknown) {
    throw toRemoteRdyError(error, { code: 'config', provider, tokenForwarded: headers !== undefined, url });
  }

  writeHuman(formatManifestView({ kits: manifest.kits, manifestPath: url }) + '\n', json);

  // A remote manifest's paths name locations on the host that published it, so they are passed
  // through rather than rebased onto a directory that does not exist here.
  return finishList(
    manifest.kits.map((kit) => buildManifestEntry(kit, undefined)),
    json,
  );
}

/** Enumerate kits using the project config. */
async function runOwnerMode(json: boolean): Promise<number> {
  const cwd = process.cwd();
  const config = await loadListingConfig();

  const internalDir = path.join(cwd, KITS_DIR, config.internal.dir);
  const internalExtension = config.internal.infix !== undefined ? `.${config.internal.infix}.ts` : '.ts';

  let internalKits;
  try {
    internalKits = enumerateKits({ dir: internalDir, extension: internalExtension });
  } catch (error: unknown) {
    throw configError(describeError(error), { cause: error });
  }

  const manifestPath = path.resolve(cwd, DEFAULT_MANIFEST_PATH);
  let manifestKits: RdyManifestKit[] = [];
  try {
    manifestKits = readManifest(manifestPath).kits;
  } catch (error: unknown) {
    // A missing manifest is the normal state of a project that never compiled, and says nothing on its
    // own: the empty-listing hint belongs to the view, which sees the package sections too. Anything
    // else is a manifest that exists and cannot be read, which the reader should hear about.
    if (!(error instanceof ManifestNotFoundError)) {
      process.stderr.write(`Warning: ${describeError(error)}\n`);
    }
  }

  const packageKits = collectConfiguredPackageKits(config.packages);
  const availablePackages = discoverKitPackages(cwd).filter((name) => !config.packages.includes(name));

  const compiledKits = manifestKits.map((kit) => kit.name);
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
    ...manifestKits.map((kit) => buildManifestEntry(kit, path.dirname(manifestPath))),
    ...packageKits.map((kit) => buildPackageEntry(kit, true)),
  ];
  return finishList(entries, json, availablePackages);
}

/**
 * Enumerates every kit-publishing dependency of the working directory, with the kits each publishes.
 *
 * The dependency axis alone: a project's own kits belong to the owner listing, and this view answers what
 * the project's dependencies offer rather than what it holds. Both the packages the config names and the
 * ones it omits are reported, since the question is what is available rather than what a run would select.
 */
async function runPackagesMode(json: boolean): Promise<number> {
  const config = await loadListingConfig();
  const groups = collectKitPackageGroups({ configuredPackages: config.packages, fromDir: process.cwd() });

  writeHuman(formatPackagesView({ groups }) + '\n', json);

  return finishList(
    groups.flatMap((group) => group.kits.map((kit) => buildPackageEntry(kit, group.configured))),
    json,
  );
}

/**
 * Enumerates the compiled kits of every kit project below the working directory.
 *
 * Compiled kits only: an internal kit is never reachable from another directory, since `--jit` and
 * `--internal` reject every source flag, and a configured package's kits belong to the dependency axis.
 * What is left is exactly the set a reader can run from where they stand.
 */
async function runRecursiveMode(json: boolean): Promise<number> {
  const root = process.cwd();
  const projects = await discoverKitProjects({ root });

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
 * Reads one project's compiled kits, preferring its manifest and falling back to the files on disk.
 *
 * The manifest is where the descriptions live, and a project compiled with `--skip-manifest` still has
 * kits worth naming.
 */
function collectProjectKits(project: KitProject): JsonListKitEntry[] {
  const manifest = readProjectManifest(project.manifestPath);
  if (manifest !== undefined) {
    const manifestDir = path.dirname(project.manifestPath);
    return manifest.kits.map((kit) => buildManifestEntry(kit, manifestDir, project.dir));
  }

  const outDir = path.resolve(project.absolutePath, project.config.compile.outDir);

  let names: string[];
  try {
    names = enumerateKits({ dir: outDir, extension: '.js' });
  } catch (error: unknown) {
    if (!isSkippableFilesystemError(error)) throw error;
    process.stderr.write(`Warning: Cannot read ${outDir}. Omitting ${project.dir} from the listing.\n`);
    return [];
  }

  return names.map((name) => ({
    name,
    kind: 'compiled',
    project: project.dir,
    path: path.relative(process.cwd(), path.join(outDir, `${name}.js`)),
  }));
}

/**
 * Reads a project's manifest, treating a missing one as absent and reporting an unreadable one.
 *
 * A manifest nobody can read costs that project its descriptions, not its listing: the kits themselves
 * are still on disk.
 */
function readProjectManifest(manifestPath: string): RdyManifest | undefined {
  try {
    return readManifest(manifestPath);
  } catch (error: unknown) {
    if (!(error instanceof ManifestNotFoundError)) {
      process.stderr.write(`Warning: ${describeError(error)}\n`);
    }
    return undefined;
  }
}

/**
 * Collects the kits the configured packages publish, tolerating one that cannot be expanded.
 *
 * `run` fails hard on the same configuration, because it would otherwise execute against a package set
 * nobody chose. Listing is read-only, so it takes the warn-and-continue the corrupt-manifest path above
 * already takes: a reader asking what exists is better served by the rest of the answer than by none.
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
 * Labels a package kit, its package first, so a kit reads the same here as in the heading a run gives it.
 *
 * The row's own token supplies the package glyph, so the label carries only what follows it.
 */
function describePackageKit(kit: PackageKit): string {
  const version = kit.version === undefined ? '' : `@${kit.version}`;
  return `${kit.packageName}${version}${SEGMENT_SEPARATOR}${getLayout().inlineGlyph('kit')}${kit.kitName}`;
}

/** Builds the row for a kit an installed package publishes, recording whether the config names it. */
function buildPackageEntry(kit: PackageKit, configured: boolean): JsonListKitEntry {
  return {
    name: kit.kitName,
    kind: 'compiled',
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
 * Loads the project config, falling back to the defaults and reporting a config it cannot evaluate.
 *
 * Listing is read-only, so a config that cannot be evaluated costs the caller its settings rather than
 * the answer, taking the same warn-and-continue the corrupt-manifest paths take. `run` still fails hard on
 * the same failure: it would otherwise execute against settings nobody chose.
 */
async function loadListingConfig(): Promise<ResolvedRdyConfig> {
  try {
    return await loadConfig();
  } catch (error: unknown) {
    const detail = describeError(error).replace(/\.$/, '');
    process.stderr.write(`Warning: ${detail}. Listing with default settings.\n`);
    const hint = extractHint(error);
    if (hint !== undefined) process.stderr.write(getLayout().formatHint(hint) + '\n');
    return { ...DEFAULT_CONFIG };
  }
}

/** Emit the list payload under `--json`. Listing succeeds whenever its source could be read. */
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

/** Build the rows a manifest declares, rebasing each recorded path onto the current directory. */
function manifestEntries(manifest: RdyManifest, manifestPath: string): JsonListKitEntry[] {
  return manifest.kits.map((kit) => buildManifestEntry(kit, path.dirname(manifestPath)));
}

/**
 * Build a kit row from a manifest entry.
 *
 * Every field but `name` and `kind` comes from the manifest, so a kit compiled by an older readyup
 * simply carries fewer of them. `checklists` is read here rather than from the kit itself: listing
 * kits never imports a compiled bundle, so it never runs kit code.
 *
 * `manifestDir` rebases the recorded path onto the current directory, so a consumer can hand it
 * straight to `rdy run --file`. Pass `undefined` for a manifest that is not on this machine.
 *
 * `project` names the directory a repo-wide sweep found the kit in. Pass `undefined` for a listing that
 * reads one project.
 */
function buildManifestEntry(kit: RdyManifestKit, manifestDir: string | undefined, project?: string): JsonListKitEntry {
  const entry: JsonListKitEntry = { name: kit.name, kind: 'compiled' };

  if (project !== undefined) entry.project = project;
  if (kit.path !== undefined) {
    entry.path =
      manifestDir === undefined ? kit.path : path.relative(process.cwd(), path.resolve(manifestDir, kit.path));
  }
  if (kit.checklists !== undefined) entry.checklists = kit.checklists;
  if (kit.description !== undefined) entry.description = kit.description;
  if (kit.readyupVersion !== undefined) entry.readyupVersion = kit.readyupVersion;

  return entry;
}

/** Build a kit row for a TypeScript source awaiting compilation. */
function buildInternalEntry(name: string, dir: string, extension: string): JsonListKitEntry {
  return { name, kind: 'internal', path: path.relative(process.cwd(), path.join(dir, `${name}${extension}`)) };
}

/**
 * Enumerate the compiled kits in a directory, for a source that has no manifest beside it.
 *
 * `run --from` resolves a kit by filename alone, so a directory it can run from is one `list` must
 * be able to describe. The rows carry only what the filesystem knows: everything else — description,
 * checklist names, the readyup version a kit was built against — lives in the manifest that is absent.
 *
 * A source with neither a manifest nor a kit directory is still an error. Reporting "no kits" for a
 * path that does not exist would turn a mistyped `--from` into a clean, empty answer.
 */
function enumerateCompiledKits(kitsDir: string, manifestPath: string): JsonListKitEntry[] {
  if (!existsSync(kitsDir)) {
    const relManifest = path.relative(process.cwd(), manifestPath);
    const relKitsDir = path.relative(process.cwd(), kitsDir);
    throw configError(`No manifest found at ${relManifest}, and no kit directory at ${relKitsDir}.`);
  }

  let names: string[];
  try {
    names = enumerateKits({ dir: kitsDir, extension: '.js' });
  } catch (error: unknown) {
    throw configError(describeError(error), { cause: error });
  }

  return names.map((name) => ({
    name,
    kind: 'compiled',
    path: path.relative(process.cwd(), path.join(kitsDir, `${name}.js`)),
  }));
}

/** Read a manifest, returning undefined when there is none and reporting any other failure. */
function readLocalManifestIfPresent(manifestPath: string): RdyManifest | undefined {
  try {
    return readManifest(manifestPath);
  } catch (error: unknown) {
    if (error instanceof ManifestNotFoundError) return undefined;
    throw configError(describeError(error), { cause: error });
  }
}

/** Reads a manifest, reporting an unreadable or invalid one as a config failure. */
function readManifestOrThrow(manifestPath: string): RdyManifest {
  try {
    return readManifest(manifestPath);
  } catch (error: unknown) {
    throw configError(describeError(error), { cause: error });
  }
}

/** Resolve the manifest path for a parsed local `--from` source. */
function resolveFromManifestPath(source: LocalFromSource): string {
  if (source.type === 'global') {
    return path.join(resolveHomeDir(), '.readyup/manifest.json');
  }

  if (source.type === 'directory') {
    return path.join(path.resolve(source.path), 'manifest.json');
  }

  // local path
  return path.join(path.resolve(source.path), '.readyup/manifest.json');
}

/** Resolve the directory a local `--from` source keeps its compiled kits in, matching `run --from`. */
function resolveFromKitsDir(source: LocalFromSource): string {
  if (source.type === 'global') {
    return path.join(resolveHomeDir(), KITS_DIR);
  }

  if (source.type === 'directory') {
    return path.resolve(source.path);
  }

  // local path
  return path.join(path.resolve(source.path), KITS_DIR);
}
