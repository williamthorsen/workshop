import type { CommandOutput } from '../shared/output.ts';

/** A command output whose streams are recorded for assertions. */
export interface CapturedOutput {
  output: CommandOutput;
  stderr: () => string;
  stdout: () => string;
}

/** Builds a command output named `name` that records everything written to stdout and stderr. */
export function captureOutput(name = 'command'): CapturedOutput {
  let out = '';
  let err = '';
  return {
    output: {
      name,
      stderr: {
        write: (text: string) => {
          err += text;
        },
      },
      stdout: {
        write: (text: string) => {
          out += text;
        },
      },
    },
    stderr: () => err,
    stdout: () => out,
  };
}
