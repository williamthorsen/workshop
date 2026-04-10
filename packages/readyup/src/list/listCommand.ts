import path from 'node:path';
import process from 'node:process';

import { loadConfig } from '../loadConfig.ts';
import { parseArgs, translateParseError } from '../parseArgs.ts';
import { extractMessage } from '../utils/error-handling.ts';
import { enumerateKits } from './enumerateKits.ts';
import type { CompiledStyle } from './formatList.ts';
import { formatConsumerView, formatOwnerView } from './formatList.ts';

const listFlagSchema = {
  local: { long: '--local', type: 'string' as const, short: '-l' },
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

  const localPathArg = parsed.flags.local;

  if (localPathArg !== undefined) {
    return runConsumerMode(localPathArg);
  }

  return runOwnerMode();
}

/** Enumerate kits from a local path without loading config. */
function runConsumerMode(localPathArg: string): number {
  const kitsDir = path.join(path.resolve(localPathArg), '.rdy/kits');

  let compiledKits;
  try {
    compiledKits = enumerateKits({ dir: kitsDir, extension: '.js' });
  } catch (error: unknown) {
    const message = extractMessage(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }

  const output = formatConsumerView({ compiledKits, localPathArg });
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

  const internalDir = path.join(cwd, '.rdy/kits', config.internal.dir);
  const compiledDir = path.resolve(cwd, config.compile.outDir);

  let internalKits;
  let compiledKits;
  try {
    internalKits = enumerateKits({ dir: internalDir, extension: config.internal.extension });
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
  const defaultOutDir = path.resolve(cwd, '.rdy/kits');

  if (resolvedOutDir === defaultOutDir) {
    return { kind: 'local-convention' };
  }

  const outDirRel = path.relative(cwd, resolvedOutDir);
  return { kind: 'custom-outDir', outDirRel };
}
