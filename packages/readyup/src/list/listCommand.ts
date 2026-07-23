import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { configError, usageError } from '../errors.ts';
import { EXIT_OK } from '../exitCodes.ts';
import { KITS_DIR, resolveHomeDir } from '../kitsDir.ts';
import { DEFAULT_CONFIG, loadConfig } from '../loadConfig.ts';
import { loadRemoteManifest, RemoteManifestNotFoundError } from '../loadRemoteManifest.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RdyManifest, RdyManifestKit } from '../manifest/manifestSchema.ts';
import { ManifestNotFoundError, readManifest } from '../manifest/readManifest.ts';
import type { DirectorySource, GlobalSource, LocalSource } from '../parseFromValue.ts';
import { parseFromValue } from '../parseFromValue.ts';
import { resolveBitbucketToken } from '../resolveBitbucketToken.ts';
import { resolveGitHubToken } from '../resolveGitHubToken.ts';
import type { JsonListKitEntry, JsonListOutput } from '../schemas/index.ts';
import { SCHEMA_VERSION } from '../schemas/listOutputSchema.ts';
import { extractMessage } from '../utils/error-handling.ts';
import { translateParseArgsError } from '../utils/parse-args-error.ts';
import { writeHuman } from '../writeHuman.ts';
import { enumerateKits } from './enumerateKits.ts';
import type { CompiledStyle } from './formatList.ts';
import { formatConsumerView, formatManifestView, formatOwnerView } from './formatList.ts';

/** A local `--from` source, which resolves to a directory on this machine. */
type LocalFromSource = DirectorySource | GlobalSource | LocalSource;

const listOptions = {
  from: { type: 'string' },
  json: { type: 'boolean' },
  manifest: { type: 'string' },
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
    throw usageError(translateParseArgsError(error), { cause: error });
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

  if (manifestArg !== undefined) {
    return runManifestMode(manifestArg, json);
  }

  if (fromArg !== undefined) {
    return runFromMode(fromArg, json);
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
    throw usageError(extractMessage(error), { cause: error });
  }

  if (source.type === 'github') {
    const url = `https://raw.githubusercontent.com/${source.org}/${source.repo}/${source.ref}/.readyup/manifest.json`;
    const token = resolveGitHubToken();
    const headers = token !== undefined ? { Authorization: `token ${token}` } : undefined;
    return runRemoteFromMode({ url, headers, json });
  }

  if (source.type === 'bitbucket') {
    const url = `https://api.bitbucket.org/2.0/repositories/${source.workspace}/${source.repo}/src/${source.ref}/.readyup/manifest.json`;
    const token = resolveBitbucketToken();
    const headers = token !== undefined ? { Authorization: `Bearer ${token}` } : undefined;
    return runRemoteFromMode({ url, headers, json });
  }

  const manifestPath = resolveFromManifestPath(source);
  const kitsDir = resolveFromKitsDir(source);
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

/** Fetch and display kits from a remote manifest URL. */
async function runRemoteFromMode({
  url,
  headers,
  json,
}: {
  url: string;
  headers?: Record<string, string> | undefined;
  json: boolean;
}): Promise<number> {
  let manifest;
  try {
    manifest = await loadRemoteManifest({ url, headers });
  } catch (error: unknown) {
    if (error instanceof RemoteManifestNotFoundError) {
      throw configError(`No manifest found at ${url}.`, { cause: error });
    }
    const message = extractMessage(error);
    // Network failures (raw `fetch` rejections) carry no URL context; thrown errors from `loadRemoteManifest` already include the URL.
    const detail = message.includes(url) ? message : `Failed to reach ${url}: ${message}`;
    throw configError(detail, { cause: error });
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

  // Listing is read-only, so a config that cannot be evaluated costs the caller its settings rather
  // than the answer — the same warn-and-continue the corrupt-manifest path below takes. `run` still
  // fails hard on the same failure: it would otherwise execute against settings nobody chose.
  let config;
  try {
    config = await loadConfig();
  } catch (error: unknown) {
    const detail = extractMessage(error).replace(/\.$/, '');
    process.stderr.write(`Warning: ${detail}. Listing with default settings.\n`);
    config = { ...DEFAULT_CONFIG };
  }

  const internalDir = path.join(cwd, KITS_DIR, config.internal.dir);
  const internalExtension = config.internal.infix !== undefined ? `.${config.internal.infix}.ts` : '.ts';

  let internalKits;
  try {
    internalKits = enumerateKits({ dir: internalDir, extension: internalExtension });
  } catch (error: unknown) {
    throw configError(extractMessage(error), { cause: error });
  }

  const manifestPath = path.resolve(cwd, DEFAULT_MANIFEST_PATH);
  let manifestKits: RdyManifestKit[] = [];
  try {
    manifestKits = readManifest(manifestPath).kits;
  } catch (error: unknown) {
    if (error instanceof ManifestNotFoundError) {
      // Missing manifest — show hint only when no internal kits exist either.
      if (internalKits.length === 0) {
        writeHuman(
          'No kits found.\nRun `rdy init` to scaffold an internal kit or `rdy compile` to compile a kit from source.\n',
          json,
        );
        return finishList([], json);
      }
    } else {
      // Corrupt or unreadable manifest — warn and continue with empty compiled list.
      process.stderr.write(`Warning: ${extractMessage(error)}\n`);
    }
  }

  const compiledKits = manifestKits.map((kit) => kit.name);
  const compiledStyle = resolveCompiledStyle(cwd, config.compile.outDir);
  const needsInternalFlag = config.internal.dir !== '.' || config.internal.infix !== undefined;
  writeHuman(formatOwnerView({ internalKits, compiledKits, compiledStyle, needsInternalFlag }) + '\n', json);

  const entries: JsonListKitEntry[] = [
    ...internalKits.map((name) => buildInternalEntry(name, internalDir, internalExtension)),
    ...manifestKits.map((kit) => buildManifestEntry(kit, path.dirname(manifestPath))),
  ];
  return finishList(entries, json);
}

/** Emit the list payload under `--json`. Listing succeeds whenever its source could be read. */
function finishList(kits: JsonListKitEntry[], json: boolean): number {
  if (json) {
    const output: JsonListOutput = { schemaVersion: SCHEMA_VERSION, kits };
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
 */
function buildManifestEntry(kit: RdyManifestKit, manifestDir: string | undefined): JsonListKitEntry {
  const entry: JsonListKitEntry = { name: kit.name, kind: 'compiled' };

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
    throw configError(extractMessage(error), { cause: error });
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
    throw configError(extractMessage(error), { cause: error });
  }
}

/** Reads a manifest, reporting an unreadable or invalid one as a config failure. */
function readManifestOrThrow(manifestPath: string): RdyManifest {
  try {
    return readManifest(manifestPath);
  } catch (error: unknown) {
    throw configError(extractMessage(error), { cause: error });
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

/** Determine the compiled-section display style based on the outDir setting. */
function resolveCompiledStyle(cwd: string, outDir: string): CompiledStyle {
  const resolvedOutDir = path.resolve(cwd, outDir);
  const defaultOutDir = path.resolve(cwd, KITS_DIR);

  if (resolvedOutDir === defaultOutDir) {
    return { kind: 'local-convention' };
  }

  const outDirRel = path.relative(cwd, resolvedOutDir);
  return { kind: 'custom-outDir', outDirRel };
}
