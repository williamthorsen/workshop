import { createCli, runCli, type Writer } from '@williamthorsen/toolbelt.cli/candidate';

import type { CatalogueResult } from '../catalogue/read-catalogue.ts';
import type { RunWorker } from '../worker/run-worker.ts';
import { defineGenerateCommand } from './generate-command.ts';
import { defineSpritesCommand } from './sprites-command.ts';

const { defineGroup } = createCli<RunEffects>();

/**
 * Runs the `thor-image` command line, writing to the given writers and resolving to the exit code rather than
 * exiting, so that the whole surface is exercisable without a process. An empty argv prints the help. A usage error
 * is reported through the writers with exit 2; any other error propagates to the caller.
 */
export async function run(args: readonly string[], effects: RunEffects, streams: RunStreams): Promise<number> {
  const catalogue = effects.readCatalogue();
  if (!catalogue.ok) {
    streams.stderr.write(
      `thor-image: the style catalogue is invalid:\n${catalogue.problems.map((problem) => `  ${problem}\n`).join('')}`,
    );
    return 1;
  }

  const root = defineGroup({
    summary: 'Generate images in named styles from open-weight models, and render coded pixel art to sprite strips.',
    epilog: `Exit codes:
  0    The images were rendered, or help or version was printed
  1    Rendering failed, the sprite data was invalid or unreadable, or thor-image hit an internal error
  2    Usage error
  127  uv, which runs the renderer of generate, is not on PATH`,
    commands: { generate: defineGenerateCommand(catalogue.styles), sprites: defineSpritesCommand() },
  });
  return runCli(args.length === 0 ? ['--help'] : args, root, {
    name: 'thor-image',
    baseDir: effects.cwd,
    context: effects,
    version: () => effects.resolveVersion(),
    stdout: streams.stdout,
    stderr: streams.stderr,
  });
}

/** The effects deferred to the entry point, which keeps the runner free of process I/O. */
export interface RunEffects {
  readonly arch: string;
  /** The working directory, against which relative paths resolve. */
  readonly cwd: string;
  /** Returns a random seed for a run that names none. */
  readonly drawSeed: () => number;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly now: () => Date;
  readonly platform: string;
  readonly readCatalogue: () => CatalogueResult;
  readonly resolveVersion: () => string;
  readonly runWorker: RunWorker;
}

/** The writers that receive the command's output. */
export interface RunStreams {
  readonly stderr: Writer;
  readonly stdout: Writer;
}
