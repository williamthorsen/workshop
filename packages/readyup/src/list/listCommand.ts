import path from 'node:path';
import process from 'node:process';

import { loadConfig } from '../loadConfig.ts';
import { loadRemoteManifest, RemoteManifestNotFoundError } from '../loadRemoteManifest.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import { ManifestNotFoundError, readManifest } from '../manifest/readManifest.ts';
import { parseArgs, translateParseError } from '../parseArgs.ts';
import { parseFromValue } from '../parseFromValue.ts';
import { resolveGitHubToken } from '../resolveGitHubToken.ts';
import { extractMessage } from '../utils/error-handling.ts';
import { enumerateKits } from './enumerateKits.ts';
import type { CompiledStyle } from './formatList.ts';
import { formatConsumerView, formatManifestView, formatOwnerView } from './formatList.ts';

const listFlagSchema = {
  from: { long: '--from', type: 'string' as const },
  manifest: { long: '--manifest', type: 'string' as const },
};

/**
 * Handle the `list` subcommand: enumerate kits from the manifest and filesystem, then print their names.
 *
 * Returns a numeric exit code.
 */
export async function listCommand(args: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs(args, listFlagSchema);
  } catch (error: unknown) {
    process.stderr.write(`Error: ${translateParseError(error)}\n`);
    return 1;
  }

  const fromArg = parsed.flags.from;
  const manifestArg = parsed.flags.manifest;

  if (fromArg !== undefined && manifestArg !== undefined) {
    process.stderr.write('Error: --from and --manifest are mutually exclusive\n');
    return 1;
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

  let manifest;
  try {
    manifest = readManifest(manifestPath);
  } catch (error: unknown) {
    const message = extractMessage(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }

  const relPath = path.relative(process.cwd(), manifestPath);
  const output = formatManifestView({ kits: manifest.kits, manifestPath: relPath });
  process.stdout.write(output + '\n');
  return 0;
}

/** Resolve the manifest path for a `--from` source and display its kits. */
async function runFromMode(fromArg: string): Promise<number> {
  let source;
  try {
    source = parseFromValue(fromArg);
  } catch (error: unknown) {
    const message = extractMessage(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }

  if (source.type === 'github') {
    const url = `https://raw.githubusercontent.com/${source.org}/${source.repo}/${source.ref}/.readyup/manifest.json`;
    const token = resolveGitHubToken();
    return runRemoteFromMode({ url, token });
  }

  if (source.type === 'bitbucket') {
    process.stderr.write(`Error: Listing kits from ${source.type} repositories is not yet supported.\n`);
    return 1;
  }

  const manifestPath = resolveFromManifestPath(source);

  let manifest;
  try {
    manifest = readManifest(manifestPath);
  } catch (error: unknown) {
    const message = extractMessage(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }

  const kitNames = manifest.kits.map((kit) => kit.name);
  const output = formatConsumerView({ compiledKits: kitNames, fromArg, kitsDir: path.dirname(manifestPath) });
  process.stdout.write(output + '\n');
  return 0;
}

/** Fetch and display kits from a remote manifest URL. */
async function runRemoteFromMode({ url, token }: { url: string; token: string | undefined }): Promise<number> {
  let manifest;
  try {
    manifest = await loadRemoteManifest({ url, token });
  } catch (error: unknown) {
    if (error instanceof RemoteManifestNotFoundError) {
      process.stderr.write(`Error: No manifest found at ${url}. Has \`rdy compile --with-manifest\` been run?\n`);
      return 1;
    }
    const message = extractMessage(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }

  const output = formatManifestView({ kits: manifest.kits, manifestPath: url });
  process.stdout.write(output + '\n');
  return 0;
}

/** Enumerate kits using the project config. */
async function runOwnerMode(): Promise<number> {
  const cwd = process.cwd();

  let config;
  try {
    config = await loadConfig();
  } catch (error: unknown) {
    const message = extractMessage(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }

  const internalDir = path.join(cwd, '.readyup/kits', config.internal.dir);
  const internalExtension = config.internal.infix !== undefined ? `.${config.internal.infix}.ts` : '.ts';

  let internalKits;
  try {
    internalKits = enumerateKits({ dir: internalDir, extension: internalExtension });
  } catch (error: unknown) {
    const message = extractMessage(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
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
        return 0;
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
  return 0;
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
