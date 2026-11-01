import { type ChildProcess, spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { describeError } from '@williamthorsen/toolbelt.errors';

import type { Invocation } from './invocation.ts';

/** A voice-clone server to start: the program, the URL at which it answers once ready, and the file for its output. */
export interface ServerProcess extends Invocation {
  readonly baseUrl: string;
  readonly logPath: string;
}

/** A running voice-clone server. Disposing of it stops it. */
export interface VoiceServer extends AsyncDisposable {
  readonly baseUrl: string;
  readonly stop: () => Promise<void>;
}

/** Overrides of how long to wait for the server, for tests. */
export interface StartVoiceServerOptions {
  readonly readyTimeoutMs?: number;
  readonly stopGraceMs?: number;
}

/** The outcome of starting the server: the server, once it answers HTTP, or why it never did. */
export type StartVoiceServerResult = { ok: true; server: VoiceServer } | { ok: false; message: string };

const POLL_INTERVAL_MS = 250;

const READY_TIMEOUT_MS = 60_000;

const STOP_GRACE_MS = 5_000;

const TERMINATING_SIGNALS: readonly NodeJS.Signals[] = ['SIGHUP', 'SIGINT', 'SIGTERM'];

/**
 * Starts the server with its output appended to its log, and resolves once it answers any HTTP request. A server
 * that exits first, or that does not answer within the timeout, is stopped and reported. Until it is stopped, a
 * SIGINT, SIGTERM, or SIGHUP to this process stops it and then exits, so that it never outlives this process.
 */
export async function startVoiceServer(
  server: ServerProcess,
  { readyTimeoutMs = READY_TIMEOUT_MS, stopGraceMs = STOP_GRACE_MS }: StartVoiceServerOptions = {},
): Promise<StartVoiceServerResult> {
  const { args, baseUrl, command, env, logPath } = server;
  mkdirSync(path.dirname(logPath), { recursive: true });
  const logFd = openSync(logPath, 'a');
  let child: ChildProcess;
  try {
    child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['ignore', logFd, logFd] });
  } finally {
    closeSync(logFd);
  }

  let exitDescription: string | undefined;
  const exited = new Promise<void>((resolve) => {
    child.once('error', (error) => {
      exitDescription ??= `could not start (${describeError(error)})`;
      resolve();
    });
    child.once('exit', (code, signal) => {
      exitDescription ??= code === null ? `was stopped by ${signal}` : `exited with code ${code}`;
      resolve();
    });
  });

  let stopping: Promise<void> | undefined;
  async function terminate(): Promise<void> {
    for (const signal of TERMINATING_SIGNALS) process.off(signal, stopAndExit);
    if (exitDescription !== undefined) return;

    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), stopGraceMs);
    await exited;
    clearTimeout(timer);
  }
  function stop(): Promise<void> {
    stopping ??= terminate();
    return stopping;
  }
  function stopAndExit(signal: NodeJS.Signals): void {
    void stop().finally(() => {
      process.exit(128 + os.constants.signals[signal]);
    });
  }
  for (const signal of TERMINATING_SIGNALS) process.on(signal, stopAndExit);

  const deadline = Date.now() + readyTimeoutMs;
  for (;;) {
    if (exitDescription !== undefined) {
      await stop();
      return { ok: false, message: `the voice-clone server ${exitDescription} before it was ready; see ${logPath}` };
    }
    if (await isAnswering(baseUrl)) {
      return { ok: true, server: { baseUrl, stop, [Symbol.asyncDispose]: stop } };
    }
    if (Date.now() >= deadline) {
      await stop();
      return {
        ok: false,
        message: `the voice-clone server did not answer on ${baseUrl} within ${readyTimeoutMs / 1_000} seconds; see ${logPath}`,
      };
    }
    await delay(POLL_INTERVAL_MS);
  }
}

// region | Helpers

/** Reports whether anything answers HTTP at `url`, whatever the status. */
async function isAnswering(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    await response.body?.cancel();
    return true;
  } catch {
    return false;
  }
}

// endregion | Helpers
