import { createCli, runCli, UsageError, type Writer } from '@williamthorsen/toolbelt.cli/candidate';
import { describeError } from '@williamthorsen/toolbelt.errors';

import { type PublishPlaceholderEffects, runPublishPlaceholder } from './runPublishPlaceholder.ts';

const { defineCommand, defineGroup } = createCli<RunEffects>();

const PUBLISH_PLACEHOLDER_DESCRIPTION = `Publish a <package-name>@0.0.0 placeholder, holding only package.json and README.md, with public access. npm
trust can be configured only for a name that the registry already has, so a new package is published this way
once, and every later version through trusted publishing.

It checks the name against npm's rules for new packages, that npm is logged in, and that the registry does not
have the name, then prints a summary and asks for confirmation. The placeholder is built in a temporary directory,
which is removed afterwards; the working directory is not written. Requires npm on PATH.`;

const PUBLISH_PLACEHOLDER_EPILOG = `npm publish runs attached to the terminal, so that a one-time password or web login that npm asks for can be
answered there. A published placeholder cannot be retracted after npm's unpublish window.

Examples:
  thor-npm publish-placeholder @scope/new-package --dry-run
  thor-npm publish-placeholder @scope/new-package`;

const ROOT = defineGroup({
  summary: 'Run npm registry chores.',
  epilog: `Exit codes:
  0    The command succeeded, or help or version was printed
  1    A check failed, the publish failed, or the confirmation was declined
  2    Usage or validation error
  127  npm is not on PATH`,
  commands: {
    'publish-placeholder': defineCommand({
      summary: 'Publish a 0.0.0 placeholder so that npm trust can be configured for a new package',
      description: PUBLISH_PLACEHOLDER_DESCRIPTION,
      epilog: PUBLISH_PLACEHOLDER_EPILOG,
      flags: {
        dryRun: {
          type: 'boolean',
          description: 'Run every check and print the summary, but publish nothing',
          short: 'n',
        },
        force: { type: 'boolean', description: 'Publish without asking for confirmation', short: 'f' },
      },
      operands: [{ name: 'package-name', description: 'The scoped or unscoped name to register' }],
      run: ({ context, flags, operands, stderr }) =>
        reportFailures(stderr, () =>
          runPublishPlaceholder({ ...flags, name: operands['package-name'] }, context, { stderr }),
        ),
    }),
  },
});

/**
 * Runs the `thor-npm` command line, writing to the given writers and resolving to the exit code rather than
 * exiting, so that the whole surface is exercisable without a process. An empty argv prints the help. Every failure
 * is reported through the writers and the exit code: Nothing throws.
 */
export async function run(args: readonly string[], effects: RunEffects, streams: RunStreams): Promise<number> {
  return runCli(args.length === 0 ? ['--help'] : args, ROOT, {
    name: 'thor-npm',
    context: effects,
    version: () => resolveVersion(effects),
    stdout: streams.stdout,
    stderr: streams.stderr,
  });
}

/** The effects deferred to the entry point, which keeps the runner free of process I/O. */
export interface RunEffects extends PublishPlaceholderEffects {
  readonly resolveVersion: () => string;
}

/** The writers that receive the command's output. */
export interface RunStreams {
  readonly stderr: Writer;
  readonly stdout: Writer;
}

// region | Helpers

/** Runs a command's body, reporting an unexpected error on stderr with exit 1; a usage error passes through. */
async function reportFailures(stderr: Writer, body: () => Promise<number>): Promise<number> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof UsageError) throw error;

    stderr.write(`thor-npm: ${describeError(error)}\n`);
    return 1;
  }
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
