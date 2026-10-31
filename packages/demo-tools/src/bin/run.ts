import { createCli, runCli, UsageError, type Writer } from '@williamthorsen/toolbelt.cli/candidate';
import { describeError } from '@williamthorsen/toolbelt.errors';

const { defineGroup } = createCli<RunEffects>();

const ROOT = defineGroup({
  summary: 'Render and archive aidemo demos.',
  epilog: `Its commands are not implemented yet.

Exit codes:
  0  Help or version printed
  2  Usage or validation error`,
  commands: {},
});

/**
 * Runs the `thor-demo` command line, returning what to write and exit with rather than doing either, so that the
 * whole surface is exercisable without a process. An empty argv prints the help. Every failure is reported through
 * the result: Nothing throws.
 */
export async function run(args: readonly string[], effects: RunEffects): Promise<RunResult> {
  const stdout = createTextBuffer();
  const stderr = createTextBuffer();
  const exitCode = await runCli(args.length === 0 ? ['--help'] : args, ROOT, {
    name: 'thor-demo',
    context: effects,
    version: () => resolveVersion(effects),
    stdout,
    stderr,
  });

  return { exitCode, stderr: stderr.text, stdout: stdout.text };
}

/** The effects deferred to the entry point, which keeps the runner free of I/O. */
export interface RunEffects {
  readonly resolveVersion: () => string;
}

/** What the caller should write to each stream and exit with. */
export interface RunResult {
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

/** Resolves the installed version, reporting a failure as a usage error, which exits 2. */
function resolveVersion(effects: RunEffects): string {
  try {
    return effects.resolveVersion();
  } catch (error) {
    throw new UsageError(describeError(error), { cause: error });
  }
}

// endregion | Helpers
