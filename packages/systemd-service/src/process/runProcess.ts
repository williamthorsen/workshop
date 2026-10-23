import { execFile } from 'node:child_process';

/** What one captured process run produced. */
export interface ProcessRun {
  exitCode: number;
  /** Both streams, stdout first, because a tool may write its diagnosis to either. */
  output: string;
  stdout: string;
}

/**
 * Runs a program to completion and reports its exit code and output.
 *
 * A program that could not be started rejects; one that ran and exited nonzero resolves, because its callers read a
 * refusal as an outcome. A run ended by a signal reports exit code 1.
 */
export function runProcess(command: string, args: readonly string[]): Promise<ProcessRun> {
  return new Promise((resolve, reject) => {
    void execFile(command, args, { encoding: 'utf8' }, (error, stdout, stderr) => {
      const output = `${stdout}${stderr}`;
      if (error === null) {
        resolve({ exitCode: 0, output, stdout });
      } else if (typeof error.code === 'number') {
        resolve({ exitCode: error.code, output, stdout });
      } else if (typeof error.signal === 'string') {
        resolve({ exitCode: 1, output, stdout });
      } else {
        reject(new Error(error.message, { cause: error }));
      }
    });
  });
}
