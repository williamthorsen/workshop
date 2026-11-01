import { spawn } from 'node:child_process';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

/** A program to run, with its arguments and the variables to add to the inherited environment. */
export interface Invocation {
  readonly args: readonly string[];
  readonly command: string;
  readonly env: Readonly<Record<string, string>>;
}

/** The outcome of running an invocation: success, or a message naming the program and how it failed. */
export type InvocationOutcome = { ok: true } | { ok: false; message: string };

/** Runs an invocation to completion. */
export type RunInvocation = (invocation: Invocation) => Promise<InvocationOutcome>;

/**
 * Runs an invocation with its output sent to this process's stderr, which keeps stdout free for what the command
 * reports, and resolves once it exits.
 */
export async function runInvocation({ args, command, env }: Invocation): Promise<InvocationOutcome> {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['ignore', process.stderr, 'inherit'] });

  return new Promise((resolve) => {
    child.once('error', (error) => {
      resolve({ ok: false, message: `cannot run ${command}: ${describeError(error)}` });
    });
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve({ ok: true });
        return;
      }
      const how = code === null ? `was stopped by ${signal}` : `exited with code ${code}`;
      resolve({ ok: false, message: `${command} ${args.join(' ')} ${how}` });
    });
  });
}
