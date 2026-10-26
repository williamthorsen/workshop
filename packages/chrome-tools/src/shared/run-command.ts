import { spawnSync } from 'node:child_process';
import os from 'node:os';

import { CommandError, isErrnoException } from './errors.ts';

/** What a finished subprocess reported. */
export interface CommandResult {
  status: number;
  stderr: string;
  stdout: string;
}

/** Runs a program to completion, under the caller's environment unless `options` replaces it. */
export type RunCommand = (program: string, args: readonly string[], options?: RunCommandOptions) => CommandResult;

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Text written to the program's stdin, which is then closed. */
  input?: string;
  /**
   * `pipe` (the default) captures stdout and stderr. `inherit` connects the program to this process's streams, so that
   * its output streams to the terminal as it runs and the result's `stdout` and `stderr` are empty; stdin is inherited
   * too, unless `input` supplies it.
   */
  stdio?: 'inherit' | 'pipe';
}

/**
 * Runs a program, normally named rather than given by path so that PATH selects it, and returns its status and output.
 * A program that PATH does not contain throws a `CommandError` with status 127, the shell's status for it; a program
 * ended by a signal reports 128 plus the signal's number, as the shell does.
 */
export const runCommand: RunCommand = (program, args, options = {}) => {
  const isInherited = options.stdio === 'inherit';
  const stdin = options.input === undefined && isInherited ? 'inherit' : 'pipe';
  const output = isInherited ? 'inherit' : 'pipe';
  const result = spawnSync(program, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    input: options.input,
    stdio: [stdin, output, output],
  });
  if (result.error !== undefined) {
    if (isErrnoException(result.error) && result.error.code === 'ENOENT') {
      throw new CommandError(`required command '${program}' not found`, 127);
    }
    throw result.error;
  }
  const status = result.status ?? readSignalStatus(result.signal);
  // Node reports an inherited stream as null, which the declared type omits
  if (isInherited) return { status, stderr: '', stdout: '' };
  return { status, stderr: result.stderr, stdout: result.stdout };
};

// region | Helpers

/** Returns the shell's status for a process ended by a signal. */
function readSignalStatus(signal: NodeJS.Signals | null): number {
  const number = signal === null ? undefined : os.constants.signals[signal];
  return 128 + (number ?? 0);
}

// endregion | Helpers
