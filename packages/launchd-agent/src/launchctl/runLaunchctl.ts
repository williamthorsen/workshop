import { describeError } from '@williamthorsen/toolbelt.errors';

import { runProcess } from '../process/runProcess.ts';

/** What one captured `launchctl` invocation produced, its streams merged. */
export interface LaunchctlRun {
  exitCode: number;
  output: string;
}

/** Runs `launchctl`, resolving with its exit code and output, and rejecting only when it cannot be run at all. */
export async function runLaunchctl(args: readonly string[]): Promise<LaunchctlRun> {
  try {
    const { exitCode, output } = await runProcess('launchctl', args);

    return { exitCode, output };
  } catch (error) {
    throw new Error(`Could not run launchctl: ${describeError(error)}.`, { cause: error });
  }
}
