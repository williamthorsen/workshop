import process from 'node:process';

import type { JsonWarning } from '../schemas/common.ts';

/** A warning as `writeWarnings` prints it: its message and the remedy that clears it, without a code. */
export type ReportedWarning = Pick<JsonWarning, 'message' | 'remedy'>;

/** Writes each warning to stderr as one `Warning:` line, with its remedy after the message. */
export function writeWarnings(warnings: readonly ReportedWarning[]): void {
  for (const { message, remedy } of warnings) {
    const text = remedy === undefined ? message : `${message} ${remedy}`;
    process.stderr.write(`Warning: ${text}\n`);
  }
}
