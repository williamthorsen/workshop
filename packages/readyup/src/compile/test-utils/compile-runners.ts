import { captureError, captureStdio } from '@williamthorsen/toolbelt.testing/candidate';

import { RdyError } from '../../errors/RdyError.ts';
import { compileCommand } from '../compileCommand.ts';

/** A compile run's exit code alongside everything that it wrote. */
export interface CompileRun {
  exitCode: number;
  stderr: string;
  stdout: string;
  stdoutChunks: readonly string[];
}

/** A raising compile run's error alongside everything that it wrote. */
export interface CompileRaisingRun {
  error: RdyError;
  stderr: string;
  stdout: string;
}

/** Runs the command over the given arguments, returning its exit code alongside everything it wrote. */
export async function compile(args: string[]): Promise<CompileRun> {
  using io = captureStdio();

  const exitCode = await compileCommand(args);

  return { exitCode, stdout: io.stdout, stdoutChunks: io.stdoutChunks, stderr: io.stderr };
}

/** Runs the command expecting it to raise, returning the error alongside everything it wrote. */
export async function compileRaising(args: string[]): Promise<CompileRaisingRun> {
  using io = captureStdio();

  const error = await captureError(RdyError, () => compileCommand(args));

  return { error, stdout: io.stdout, stderr: io.stderr };
}
