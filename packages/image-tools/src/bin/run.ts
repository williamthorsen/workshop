import { createCli, runCli, type Writer } from '@williamthorsen/toolbelt.cli/candidate';

const { defineGroup } = createCli<RunEffects>();

const ROOT = defineGroup({
  summary: 'Generate images in named styles from open-weight models.',
  epilog: `Exit codes:
  0    Help or version was printed
  1    thor-image hit an internal error
  2    Usage error`,
  commands: {},
});

/**
 * Runs the `thor-image` command line, writing to the given writers and resolving to the exit code rather than
 * exiting, so that the whole surface is exercisable without a process. An empty argv prints the help. A usage error
 * is reported through the writers with exit 2; any other error propagates to the caller.
 */
export async function run(args: readonly string[], effects: RunEffects, streams: RunStreams): Promise<number> {
  return runCli(args.length === 0 ? ['--help'] : args, ROOT, {
    name: 'thor-image',
    context: effects,
    version: () => effects.resolveVersion(),
    stdout: streams.stdout,
    stderr: streams.stderr,
  });
}

/** The effects deferred to the entry point, which keeps the runner free of process I/O. */
export interface RunEffects {
  readonly resolveVersion: () => string;
}

/** The writers that receive the command's output. */
export interface RunStreams {
  readonly stderr: Writer;
  readonly stdout: Writer;
}
