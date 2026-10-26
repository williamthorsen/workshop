import type { CommandResult, RunCommand, RunCommandOptions } from '../shared/run-command.ts';

/** A recorded call to a fake `RunCommand`. */
export interface FakeCall {
  args: readonly string[];
  options?: RunCommandOptions;
  program: string;
}

/**
 * Builds a `RunCommand` that records each call and answers it with the first result whose key is a prefix of the call's
 * `program args` line, or with status 1 and empty output when none matches. A call's options are recorded only when it
 * passes some.
 */
export function fakeRunCommand(results: Record<string, Partial<CommandResult>>): {
  calls: FakeCall[];
  run: RunCommand;
} {
  const calls: FakeCall[] = [];
  const run: RunCommand = (program, args, options) => {
    calls.push(options === undefined ? { args, program } : { args, options, program });
    const line = [program, ...args].join(' ');
    const key = Object.keys(results).find((candidate) => line.startsWith(candidate));
    const result = key === undefined ? { status: 1 } : results[key];
    return { status: 0, stderr: '', stdout: '', ...result };
  };
  return { calls, run };
}
