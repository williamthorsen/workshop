import { spawn } from 'node:child_process';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

/** A program to run, with its arguments and the variables to add to the inherited environment. */
export interface Invocation {
  readonly args: readonly string[];
  readonly command: string;
  readonly env: Readonly<Record<string, string>>;
  /** Gives the program this process's stdin, for a program that reads the keyboard. */
  readonly interactive?: boolean;
}

/**
 * The outcome of running an invocation: success, or a message naming the program and how it failed. `started` is
 * `false` when the program could not be started at all.
 */
export type InvocationOutcome = { ok: true } | { ok: false; message: string; started?: false };

/** How a run can be cut short. */
export interface RunOptions {
  /** Stops the program with SIGTERM when it aborts. */
  readonly signal?: AbortSignal;
}

/** Runs an invocation to completion. */
export type RunInvocation = (invocation: Invocation, options?: RunOptions) => Promise<InvocationOutcome>;

/**
 * Runs an invocation with its output sent to this process's stderr, which keeps stdout free for what the command
 * reports, and resolves once it exits.
 */
export async function runInvocation(
  { args, command, env, interactive = false }: Invocation,
  { signal: abortSignal }: RunOptions = {},
): Promise<InvocationOutcome> {
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: [interactive ? 'inherit' : 'ignore', process.stderr, 'inherit'],
  });
  /** Ends the program when the signal aborts. */
  function stop(): void {
    child.kill('SIGTERM');
  }
  if (abortSignal?.aborted === true) stop();
  abortSignal?.addEventListener('abort', stop, { once: true });

  return new Promise((resolve) => {
    child.once('error', (error) => {
      abortSignal?.removeEventListener('abort', stop);
      resolve({ ok: false, message: `cannot run ${command}: ${describeError(error)}`, started: false });
    });
    child.once('exit', (code, signal) => {
      abortSignal?.removeEventListener('abort', stop);
      if (code === 0) {
        resolve({ ok: true });
        return;
      }
      const how = code === null ? `was stopped by ${signal}` : `exited with code ${code}`;
      resolve({ ok: false, message: `${command} ${args.join(' ')} ${how}` });
    });
  });
}
