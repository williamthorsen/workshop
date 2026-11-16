import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Invocation, InvocationOutcome, RunInvocation } from '../invocation.ts';
import { type DownloadOptions, runDownload } from '../run-download.ts';

const INVOCATION: Invocation = { command: 'hf', args: ['download', 'org/model'], env: {} };

const LIMITS = { pollIntervalMs: 1000, retryPauseMs: 10_000, stallLimitMs: 5000 };

describe(runDownload, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the first successful attempt without reporting', async () => {
    const { lines, outcome, runs } = await download([succeed]);

    expect(outcome).toStrictEqual({ ok: true });
    expect(runs).toBe(1);
    expect(lines).toStrictEqual([]);
  });

  it('runs a failed attempt again after a pause, reporting why and which attempt follows', async () => {
    const { lines, outcome, runs } = await download([fail, fail, succeed]);

    expect(outcome).toStrictEqual({ ok: true });
    expect(runs).toBe(3);
    expect(lines).toStrictEqual([
      'org/model: hf exited with code 1; trying again in 10 seconds (attempt 2 of 3)',
      'org/model: hf exited with code 1; trying again in 10 seconds (attempt 3 of 3)',
    ]);
  });

  it('fails after the last attempt, naming the repository, the attempts, and that a rerun resumes', async () => {
    const { outcome, runs } = await download([fail, fail, fail]);

    expect(runs).toBe(3);
    expect(outcome).toStrictEqual({
      ok: false,
      message:
        'could not download org/model after 3 attempts: hf exited with code 1; rerun thor-demo voice setup to resume the download',
    });
  });

  it('does not run again a program that cannot be started', async () => {
    const missing: Attempt = () => Promise.resolve({ ok: false, message: 'cannot run hf: ENOENT', started: false });

    const { outcome, runs } = await download([missing]);

    expect(runs).toBe(1);
    expect(outcome).toStrictEqual({ ok: false, message: 'cannot run hf: ENOENT', started: false });
  });

  it('stops an attempt whose files stop changing for the stall limit, and runs it again', async () => {
    const { lines, outcome, runs, stopTimes } = await download([hang, succeed], { measure: () => 42 });

    expect(outcome).toStrictEqual({ ok: true });
    expect(runs).toBe(2);
    // The first poll records the size; the stall limit counts from there.
    expect(stopTimes).toStrictEqual([LIMITS.pollIntervalMs + LIMITS.stallLimitMs]);
    expect(lines).toStrictEqual([
      'org/model: stalled: no data for 5 seconds; trying again in 10 seconds (attempt 2 of 3)',
    ]);
  });

  it('does not stop an attempt whose files keep changing, however long it runs', async () => {
    let size = 0;
    const slow: Attempt = async () => {
      await vi.advanceTimersByTimeAsync(20 * LIMITS.stallLimitMs);
      return { ok: true };
    };

    const { outcome, runs, stopTimes } = await download([slow], { measure: () => size++ });

    expect(outcome).toStrictEqual({ ok: true });
    expect(runs).toBe(1);
    expect(stopTimes).toStrictEqual([]);
  });

  it('stops an attempt whose measurement always throws at the stall limit', async () => {
    const { outcome, stopTimes } = await download([hang, hang, hang], {
      measure: () => {
        throw new Error('EACCES');
      },
    });

    expect(stopTimes).toStrictEqual([
      LIMITS.stallLimitMs,
      2 * LIMITS.stallLimitMs + LIMITS.retryPauseMs,
      3 * LIMITS.stallLimitMs + 2 * LIMITS.retryPauseMs,
    ]);
    expect(outcome).toMatchObject({ ok: false, message: expect.stringContaining('stalled: no data for 5 seconds') });
  });

  it('does not stop an attempt whose files keep changing between occasional failed measurements', async () => {
    let polls = 0;
    const slow: Attempt = async () => {
      await vi.advanceTimersByTimeAsync(20 * LIMITS.stallLimitMs);
      return { ok: true };
    };

    const { outcome, stopTimes } = await download([slow], {
      measure: () => {
        polls++;
        if (polls % 3 === 0) throw new Error('ENOENT');
        return polls;
      },
    });

    expect(outcome).toStrictEqual({ ok: true });
    expect(stopTimes).toStrictEqual([]);
  });
});

// region | Helpers

/** One attempt of the fake program, which may wait on `signal`. */
type Attempt = (signal: AbortSignal) => Promise<InvocationOutcome>;

/** Runs `runDownload` against a fake program that behaves as `attempts` say, one entry per run. */
async function download(attempts: readonly Attempt[], options: Partial<DownloadOptions> = {}) {
  const lines: string[] = [];
  const stopTimes: number[] = [];
  const start = Date.now();
  let runs = 0;
  const run: RunInvocation = (_invocation, { signal } = {}) => {
    const attempt = attempts[runs++];
    if (attempt === undefined || signal === undefined) throw new Error('unexpected run');
    signal.addEventListener(
      'abort',
      () => {
        stopTimes.push(Date.now() - start);
      },
      { once: true },
    );
    return attempt(signal);
  };

  const pending = runDownload(
    { invocation: INVOCATION, repo: 'org/model' },
    {
      report: (line) => {
        lines.push(line);
      },
      run,
    },
    { measure: () => 0, watchedDirs: ['/voice'], ...LIMITS, ...options },
  );
  await vi.runAllTimersAsync();
  return { lines, outcome: await pending, runs, stopTimes };
}

/** Fails at once, as a program that exits non-zero does. */
function fail(): Promise<InvocationOutcome> {
  return Promise.resolve({ ok: false, message: 'hf exited with code 1' });
}

/** Runs until it is stopped, as a stalled download does. */
async function hang(signal: AbortSignal): Promise<InvocationOutcome> {
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve({ ok: false, message: 'hf was stopped by SIGTERM' }), {
      once: true,
    });
  });
}

/** Succeeds at once. */
function succeed(): Promise<InvocationOutcome> {
  return Promise.resolve({ ok: true });
}

// endregion | Helpers
