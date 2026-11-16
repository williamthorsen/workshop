import { existsSync } from 'node:fs';

import { measureDirSize } from '../portable/measure-dir-size.ts';
import type { Invocation, InvocationOutcome, RunInvocation } from './invocation.ts';

/** A repository to download and the invocation that downloads it. */
export interface Download {
  readonly invocation: Invocation;
  readonly repo: string;
}

/** What a download reports through and runs its program with. */
export interface DownloadEffects {
  readonly report: (line: string) => void;
  readonly run: RunInvocation;
}

/** Where a download writes, and the limits that it runs under. */
export interface DownloadOptions {
  readonly attempts?: number;
  /** Returns the bytes on disk under the watched directories; a throw counts as progress. */
  readonly measure?: (dirs: readonly string[]) => number;
  readonly pollIntervalMs?: number;
  readonly retryPauseMs?: number;
  readonly stallLimitMs?: number;
  readonly watchedDirs: readonly string[];
}

/** How many times a download runs before setup gives up on it. */
export const DOWNLOAD_ATTEMPTS = 3;

/** How long a download may go without its files on disk changing before it is stopped. */
export const DOWNLOAD_STALL_LIMIT_MS = 5 * 60 * 1000;

const POLL_INTERVAL_MS = 15_000;

const RETRY_PAUSE_MS = 10_000;

/**
 * Runs a download, stopping an attempt whose files on disk stop changing for the stall limit, and runs a failed or
 * stopped attempt again up to the attempt count. A program that cannot be started is not run again.
 */
export async function runDownload(
  { invocation, repo }: Download,
  { report, run }: DownloadEffects,
  {
    attempts = DOWNLOAD_ATTEMPTS,
    measure = measureDirs,
    pollIntervalMs = POLL_INTERVAL_MS,
    retryPauseMs = RETRY_PAUSE_MS,
    stallLimitMs = DOWNLOAD_STALL_LIMIT_MS,
    watchedDirs,
  }: DownloadOptions,
): Promise<InvocationOutcome> {
  for (let attempt = 1; ; attempt++) {
    const outcome = await runWatched(invocation, run, { measure, pollIntervalMs, stallLimitMs, watchedDirs });
    if (outcome.ok || outcome.started === false) return outcome;
    if (attempt >= attempts) {
      return {
        ok: false,
        message: `could not download ${repo} after ${attempts} attempts: ${outcome.message}; rerun thor-demo voice setup to resume the download`,
      };
    }
    report(
      `${repo}: ${outcome.message}; trying again in ${formatSeconds(retryPauseMs)} (attempt ${attempt + 1} of ${attempts})`,
    );
    await pause(retryPauseMs);
  }
}

// region | Helpers

/** Formats a duration in whole seconds. */
function formatSeconds(ms: number): string {
  return `${Math.round(ms / 1000)} seconds`;
}

/** Returns the bytes on disk under `dirs`, counting a directory that does not exist yet as empty. */
function measureDirs(dirs: readonly string[]): number {
  return dirs.reduce((bytes, dir) => bytes + (existsSync(dir) ? measureDirSize(dir) : 0), 0);
}

/** Resolves after `ms`. */
async function pause(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs one attempt, aborting it once the measured size has not changed for `stallLimitMs`. */
async function runWatched(
  invocation: Invocation,
  run: RunInvocation,
  {
    measure,
    pollIntervalMs,
    stallLimitMs,
    watchedDirs,
  }: Required<Pick<DownloadOptions, 'measure' | 'pollIntervalMs' | 'stallLimitMs' | 'watchedDirs'>>,
): Promise<InvocationOutcome> {
  const aborter = new AbortController();
  let lastSize = NaN;
  let lastChange = Date.now();
  const poll = setInterval(() => {
    let size: number;
    try {
      size = measure(watchedDirs);
    } catch {
      // A file that moves during the walk is progress.
      lastChange = Date.now();
      return;
    }
    if (size !== lastSize) {
      lastSize = size;
      lastChange = Date.now();
    } else if (Date.now() - lastChange >= stallLimitMs) {
      aborter.abort();
    }
  }, pollIntervalMs);

  try {
    const outcome = await run(invocation, { signal: aborter.signal });
    if (!outcome.ok && aborter.signal.aborted) {
      return { ok: false, message: `stalled: no data for ${formatSeconds(stallLimitMs)}` };
    }
    return outcome;
  } finally {
    clearInterval(poll);
  }
}

// endregion | Helpers
