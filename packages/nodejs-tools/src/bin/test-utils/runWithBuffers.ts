import { createTextBuffer } from '@williamthorsen/toolbelt.cli/candidate';

import { run } from '../run.ts';
import type { ThorNodeEffects } from '../thor-node-result.ts';

/** Runs the `thor-node` command line, collecting what it writes to each stream. */
export async function runWithBuffers(args: string[], effects: ThorNodeEffects): Promise<BufferedRun> {
  const stdout = createTextBuffer();
  const stderr = createTextBuffer();
  const exitCode = await run(args, effects, { stderr, stdout });

  return { exitCode, stderr: stderr.text, stdout: stdout.text };
}

/** What a run wrote to each stream and exited with. */
export interface BufferedRun {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}
