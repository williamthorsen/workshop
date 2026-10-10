import { spawnSync } from 'node:child_process';

import type { PnpmVersionResult } from './run.ts';

/**
 * Runs `pnpm --version` in a directory and returns the last non-empty line that it wrote to stdout, or why it
 * wrote none: The command could not be spawned, or it exited non-zero, with the last line of its stderr. The pnpm
 * that runs is the first on PATH, and corepack's download prompt is suppressed so that an unattended run does not
 * block on it. Never throws.
 *
 * @internal
 */
export function runPnpmVersion(dir: string): PnpmVersionResult {
  const { error, status, stderr, stdout } = spawnSync('pnpm', ['--version'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
  });

  if (error !== undefined) return { failure: error.message };
  if (status !== 0) {
    const detail = findLastLine(stderr);

    return { failure: detail === undefined ? `exit ${status}` : `exit ${status}: ${detail}` };
  }

  const version = findLastLine(stdout);

  return version === undefined ? { failure: 'no output' } : { version };
}

// region | Helpers

/** Finds the last non-empty line of a stream's output, trimmed, or `undefined` when it wrote none. */
function findLastLine(output: string): string | undefined {
  return output
    .split('\n')
    .map((line) => line.trim())
    .findLast((line) => line !== '');
}

// endregion | Helpers
