import type { CommandOutput } from '../shared/output.ts';

/** A command output whose streams are recorded for assertions. */
export interface CapturedOutput {
  /** Returns everything written to either stream, in the order of the writes. */
  combined: () => string;
  output: CommandOutput;
  stderr: () => string;
  stdout: () => string;
}

/** Builds a command output named `name` that records everything written to stdout and stderr. */
export function captureOutput(name = 'command'): CapturedOutput {
  let out = '';
  let err = '';
  let all = '';
  return {
    combined: () => all,
    output: {
      name,
      stderr: {
        write: (text: string) => {
          err += text;
          all += text;
        },
      },
      stdout: {
        write: (text: string) => {
          out += text;
          all += text;
        },
      },
    },
    stderr: () => err,
    stdout: () => out,
  };
}
