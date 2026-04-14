import path from 'node:path';
import process from 'node:process';

import { loadConfig } from '../loadConfig.ts';
import { readManifest } from '../manifest/readManifest.ts';
import { parseArgs, translateParseError } from '../parseArgs.ts';
import { parseFromValue } from '../parseFromValue.ts';
import { extractMessage } from '../utils/error-handling.ts';
import { enumerateKits } from './enumerateKits.ts';
import type { CompiledStyle } from './formatList.ts';
import { formatConsumerView, formatManifestView, formatOwnerView } from './formatList.ts';

const listFlagSchema = {
  from: { long: '--from', type: 'string' as const },
  manifest: { long: '--manifest', type: 'string' as const },
};

/**
 * Handle the `list` subcommand: enumerate kits from the filesystem and print their names.
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

/** Enumerate kits from a `--from` source. */
function runFromMode(fromArg: string): number {
  let source;
  try {
    source = parseFromValue(fromArg);
  } catch (error: unknown) {
    const message = extractMessage(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }

  if (source.type === 'github' || source.type === 'bitbucket') {
    process.stderr.write(`Error: Listing kits from ${source.type} repositories is not yet supported.\n`);
    return 1;
  }

  let kitsDir: string;
  if (source.type === 'global') {
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '~';
    kitsDir = path.join(homeDir, '.readyup/kits');
  } else if (source.type === 'directory') {
    kitsDir = path.resolve(source.path);
  } else {
    // local path
    kitsDir = path.join(path.resolve(source.path), '.readyup/kits');
  }

  let compiledKits;
  try {
    compiledKits = enumerateKits({ dir: kitsDir, extension: '.js' });
  } catch (error: unknown) {
    const message = extractMessage(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }

  const output = formatConsumerView({ compiledKits, fromArg, kitsDir });
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
  const compiledDir = path.resolve(cwd, config.compile.outDir);

  const internalExtension = config.internal.infix !== undefined ? `.${config.internal.infix}.ts` : '.ts';

  let internalKits;
  let compiledKits;
  try {
    internalKits = enumerateKits({ dir: internalDir, extension: internalExtension });
    compiledKits = enumerateKits({ dir: compiledDir, extension: '.js' });
  } catch (error: unknown) {
    const message = extractMessage(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }

  const compiledStyle = resolveCompiledStyle(cwd, config.compile.outDir);
  const output = formatOwnerView({ internalKits, compiledKits, compiledStyle });
  process.stdout.write(output + '\n');
  return 0;
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
