import { captureError, captureStdio } from '@williamthorsen/toolbelt.testing/candidate';

import { RdyError } from '../../errors/RdyError.ts';
import { listCommand } from '../listCommand.ts';

/** A list run's exit code alongside everything that it wrote, whole and by chunk. */
export interface ListRun {
  exitCode: number;
  stderr: string;
  stderrChunks: readonly string[];
  stdout: string;
  stdoutChunks: readonly string[];
}

/** A raising list run's error alongside everything that it wrote. */
export interface ListRaisingRun {
  error: RdyError;
  stderr: string;
  stdout: string;
}

/** Runs the command over the given arguments, returning its exit code alongside everything it wrote. */
export async function list(args: string[]): Promise<ListRun> {
  using io = captureStdio();

  const exitCode = await listCommand(args);

  return {
    exitCode,
    stdout: io.stdout,
    stdoutChunks: io.stdoutChunks,
    stderr: io.stderr,
    stderrChunks: io.stderrChunks,
  };
}

/** Runs the command expecting it to raise, returning the error alongside everything it wrote. */
export async function listRaising(args: string[]): Promise<ListRaisingRun> {
  using io = captureStdio();

  const error = await captureError(RdyError, () => listCommand(args));

  return { error, stdout: io.stdout, stderr: io.stderr };
}
