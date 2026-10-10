import type { Writer } from '@williamthorsen/toolbelt.cli/candidate';

import { run, type ThorNodeEffects } from '../run.ts';

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

// region | Helpers

/** Returns a writer that accumulates what is written to it. */
function createTextBuffer(): Writer & { readonly text: string } {
  let text = '';

  return {
    get text() {
      return text;
    },
    write(chunk: string) {
      text += chunk;
    },
  };
}

// endregion | Helpers
