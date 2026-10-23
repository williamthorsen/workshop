import { describeError } from '@williamthorsen/toolbelt.errors';

import { runProcess } from '../process/runProcess.ts';

/** What one captured `systemctl` invocation produced, its streams merged. */
export interface SystemctlRun {
  exitCode: number;
  output: string;
}

/** Runs `systemctl`, resolving with its exit code and output, and rejecting only when it cannot be run at all. */
export async function runSystemctl(args: readonly string[]): Promise<SystemctlRun> {
  try {
    const { exitCode, output } = await runProcess('systemctl', args);

    return { exitCode, output };
  } catch (error) {
    throw new Error(`Could not run systemctl: ${describeError(error)}.`, { cause: error });
  }
}
