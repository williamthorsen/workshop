import { isError } from '@williamthorsen/toolbelt.errors';

import type { CommandOutput } from './output.ts';

/** A failure that ends a command, reported on stderr as `<name>: <message>` and exiting with its own status. */
export class CommandError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'CommandError';
    this.exitCode = exitCode;
  }
}

/** Reports whether a thrown value is a Node system error. */
export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return isError(error) && 'code' in error;
}

/** Runs an asynchronous command body, reporting a thrown `CommandError` as `reportCommandErrors` does. */
export async function reportCommandErrorsAsync(output: CommandOutput, body: () => Promise<number>): Promise<number> {
  try {
    return await body();
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    warn(output, error.message);
    return error.exitCode;
  }
}

/** Writes `<name>: <message>` on stderr. */
export function warn(output: CommandOutput, message: string): void {
  output.stderr.write(`${output.name}: ${message}\n`);
}
