import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { configError, usageError } from '../errors.ts';
import { EXIT_OK } from '../exitCodes.ts';
import { loadConfig } from '../loadConfig.ts';
import { loadRemoteManifest, RemoteManifestNotFoundError } from '../loadRemoteManifest.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RdyManifest } from '../manifest/manifestSchema.ts';
import { ManifestNotFoundError, readManifest } from '../manifest/readManifest.ts';
import { parseFromValue } from '../parseFromValue.ts';
import { resolveBitbucketToken } from '../resolveBitbucketToken.ts';
import { resolveGitHubToken } from '../resolveGitHubToken.ts';
import { extractMessage } from '../utils/error-handling.ts';
import { translateParseArgsError } from '../utils/parse-args-error.ts';
import { enumerateKits } from './enumerateKits.ts';
import type { CompiledStyle } from './formatList.ts';
import { formatConsumerView, formatManifestView, formatOwnerView } from './formatList.ts';

const listOptions = {
  from: { type: 'string' },
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
  const manifestArg = values.manifest;

  if (fromArg !== undefined && manifestArg !== undefined) {
    throw usageError('--from and --manifest are mutually exclusive');
  }

  if (manifestArg !== undefined) {
    return runManifestMode(manifestArg);
  }

  if (fromArg !== undefined) {
    return runFromMode(fromArg);
  }

  return runOwnerMode();
}

/** Display kits from a manifest file. */
function runManifestMode(manifestArg: string): number {
  const manifestPath = path.resolve(process.cwd(), manifestArg);
  const manifest = readManifestOrThrow(manifestPath);

  const relPath = path.relative(process.cwd(), manifestPath);
  const output = formatManifestView({ kits: manifest.kits, manifestPath: relPath });
  process.stdout.write(output + '\n');
  return EXIT_OK;
}

/** Resolve the manifest path for a `--from` source and display its kits. */
async function runFromMode(fromArg: string): Promise<number> {
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
    return runRemoteFromMode({ url, headers });
  }

  if (source.type === 'bitbucket') {
    const url = `https://api.bitbucket.org/2.0/repositories/${source.workspace}/${source.repo}/src/${source.ref}/.readyup/manifest.json`;
    const token = resolveBitbucketToken();
    const headers = token !== undefined ? { Authorization: `Bearer ${token}` } : undefined;
    return runRemoteFromMode({ url, headers });
  }

  const manifestPath = resolveFromManifestPath(source);
  const manifest = readManifestOrThrow(manifestPath);

  const kitNames = manifest.kits.map((kit) => kit.name);
  const output = formatConsumerView({ compiledKits: kitNames, fromArg, kitsDir: path.dirname(manifestPath) });
  process.stdout.write(output + '\n');
  return EXIT_OK;
}

/** Fetch and display kits from a remote manifest URL. */
async function runRemoteFromMode({
  url,
  headers,
}: {
  url: string;
  headers?: Record<string, string> | undefined;
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

  const output = formatManifestView({ kits: manifest.kits, manifestPath: url });
  process.stdout.write(output + '\n');
  return EXIT_OK;
}

/** Enumerate kits using the project config. */
async function runOwnerMode(): Promise<number> {
  const cwd = process.cwd();

  let config;
  try {
    config = await loadConfig();
  } catch (error: unknown) {
    throw configError(extractMessage(error), { cause: error });
  }

  const internalDir = path.join(cwd, '.readyup/kits', config.internal.dir);
  const internalExtension = config.internal.infix !== undefined ? `.${config.internal.infix}.ts` : '.ts';

  let internalKits;
  try {
    internalKits = enumerateKits({ dir: internalDir, extension: internalExtension });
  } catch (error: unknown) {
    throw configError(extractMessage(error), { cause: error });
  }

  const manifestPath = path.resolve(cwd, DEFAULT_MANIFEST_PATH);
  let compiledKits: string[] = [];
  try {
    const manifest = readManifest(manifestPath);
    compiledKits = manifest.kits.map((kit) => kit.name);
  } catch (error: unknown) {
    if (error instanceof ManifestNotFoundError) {
      // Missing manifest — show hint only when no internal kits exist either.
      if (internalKits.length === 0) {
        process.stdout.write(
          'No kits found.\nRun `rdy init` to scaffold an internal kit or `rdy compile` to compile a kit from source.\n',
        );
        return EXIT_OK;
      }
    } else {
      // Corrupt or unreadable manifest — warn and continue with empty compiled list.
      const message = extractMessage(error);
      process.stderr.write(`Warning: ${message}\n`);
    }
  }

  const compiledStyle = resolveCompiledStyle(cwd, config.compile.outDir);
  const output = formatOwnerView({ internalKits, compiledKits, compiledStyle });
  process.stdout.write(output + '\n');
  return EXIT_OK;
}

/** Reads a manifest, reporting an unreadable or invalid one as a config failure. */
function readManifestOrThrow(manifestPath: string): RdyManifest {
  try {
    return readManifest(manifestPath);
  } catch (error: unknown) {
    throw configError(extractMessage(error), { cause: error });
  }
}

/** Resolve the manifest path for a parsed `--from` source. */
function resolveFromManifestPath(
  source: { type: 'global' } | { type: 'directory'; path: string } | { type: 'local'; path: string },
): string {
  if (source.type === 'global') {
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '~';
    return path.join(homeDir, '.readyup/manifest.json');
  }

  if (source.type === 'directory') {
    return path.join(path.resolve(source.path), 'manifest.json');
  }

  // local path
  return path.join(path.resolve(source.path), '.readyup/manifest.json');
}

/** Determine the compiled-section display style based on the outDir setting. */
function resolveCompiledStyle(cwd: string, outDir: string): CompiledStyle {
  const resolvedOutDir = path.resolve(cwd, outDir);
  const defaultOutDir = path.resolve(cwd, '.readyup/kits');

  if (resolvedOutDir === defaultOutDir) {
    return { kind: 'local-convention' };
  }

  const outDirRel = path.relative(cwd, resolvedOutDir);
  return { kind: 'custom-outDir', outDirRel };
}
