import { access } from 'node:fs/promises';
import path from 'node:path';

import { runProcess } from '../process/runProcess.ts';

/** Homebrew's default bin directories: Apple silicon's first, then Intel's. */
const DEFAULT_HOMEBREW_BINS = ['/opt/homebrew/bin', '/usr/local/bin'];

/**
 * Resolves this machine's Homebrew bin directory from `brew --prefix`, falling back to whichever of the default
 * locations exists when `brew` is not on PATH, and to `undefined` on a machine without Homebrew.
 */
export async function resolveHomebrewBin(): Promise<string | undefined> {
  const prefix = await readBrewPrefix();
  if (prefix !== undefined) return path.join(prefix, 'bin');

  for (const bin of DEFAULT_HOMEBREW_BINS) {
    if (await isAccessible(bin)) return bin;
  }

  return undefined;
}

// region | Helpers

/** Reports whether a path exists. */
async function isAccessible(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

/** Reads the prefix that `brew --prefix` reports, or `undefined` when `brew` cannot run or reports none. */
async function readBrewPrefix(): Promise<string | undefined> {
  try {
    const { exitCode, stdout } = await runProcess('brew', ['--prefix']);
    const prefix = stdout.trim();

    return exitCode === 0 && prefix !== '' ? prefix : undefined;
  } catch {
    return undefined;
  }
}

// endregion | Helpers
