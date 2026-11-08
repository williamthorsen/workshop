import process from 'node:process';

import type { JsonWarning } from '../schemas/common.ts';

/** Writes each warning to stderr as one `Warning:` line, with its remedy after the message. */
export function writeWarnings(warnings: readonly JsonWarning[]): void {
  for (const { message, remedy } of warnings) {
    const text = remedy === undefined ? message : `${message} ${remedy}`;
    process.stderr.write(`Warning: ${text}\n`);
  }
}
