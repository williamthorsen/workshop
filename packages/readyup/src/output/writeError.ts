import process from 'node:process';

/** The name that prefixes every program error message, whichever alias invoked the binary. */
export const PROGRAM_NAME = 'rdy';

/** Writes a program error to stderr as `rdy: <message>`, with the subject that it concerns after the prefix. */
export function writeError(message: string, subject?: string): void {
  const body = subject === undefined ? message : `${subject}: ${message}`;
  process.stderr.write(`${PROGRAM_NAME}: ${body}\n`);
}
