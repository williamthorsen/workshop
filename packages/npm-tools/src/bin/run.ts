import { createCli, isAffirmative, runCli, type Writer } from '@williamthorsen/toolbelt.cli/candidate';

import { listWorkspacePackages } from '../workspace/listWorkspacePackages.ts';
import {
  applyMoveTrust,
  type MoveTrustOptions,
  planMoveTrust,
  type PlanMoveTrustEffects,
  restoreTrust,
} from './moveTrust.ts';
import {
  PLACEHOLDER_VERSION,
  planPublishPlaceholder,
  type PlanPublishPlaceholderEffects,
  publishPlaceholder,
  type PublishPlaceholderEffects,
  type PublishPlaceholderOptions,
} from './publishPlaceholder.ts';
import type { RenderedOutput } from './RenderedOutput.ts';
import {
  renderMoveOutcome,
  renderMoveRefusal,
  renderMoveStop,
  renderMoveSummary,
  renderRestoreOutcome,
  renderRestoring,
} from './renderMoveTrust.ts';
import { renderListPackages } from './renderPackageList.ts';
import {
  renderPlaceholderStop,
  renderPlaceholderSummary,
  renderPublishOutcome,
  renderPublishRefusal,
} from './renderPublishPlaceholder.ts';

const { defineCommand, defineGroup } = createCli<RunEffects>();

const MAX_TABLE_WIDTH = 120;

const LIST_PACKAGES_DESCRIPTION = `List the packages of the pnpm workspace that contains the working directory: whether each one can be
published, its name, its version, its directory, and its description. A package can be published unless its
manifest sets "private" to true. The workspace's root package is left out.

The directory column leaves out the parent directory that every package shares, when there is one. On a terminal,
each line is cut to 120 columns, or to the terminal's width when that is narrower; piped output is never cut. Under
--json, each package's directory is relative to the workspace root, and a field that its manifest does not set is
null.`;

const LIST_PACKAGES_EPILOG = `Examples:
  thor-npm list-packages
  thor-npm list-packages --json | jq --raw-output '.packages[] | select(.private | not) | .name'`;

const MOVE_TRUST_DESCRIPTION = `Move the trusted publisher of <package-name> from one GitHub repository to another. The new trust keeps the
old one's workflow file, unless --file names another, its environment, and its permissions.

It lists the current trust and refuses unless the package has exactly one, a GitHub one belonging to --from, then
prints a summary and asks for confirmation. The registry holds one trusted publisher per package, so the old trust
is revoked before the new one is added; when adding the new one fails, the old one is added back. Requires npm on
PATH, and script(1) on macOS or Linux.`;

const MOVE_TRUST_EPILOG = `Every npm call runs attached to the terminal, so that the web login or one-time password that npm asks for can be
answered there; the command therefore needs a terminal on stdin and stdout, even under --force. If the old trust
cannot be added back, the command prints the npm command that restores it.

Examples:
  thor-npm move-trust @scope/package --from owner/old-repo --to owner/new-repo --dry-run
  thor-npm move-trust @scope/package --from owner/old-repo --to owner/new-repo --file release.yaml`;

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
  summary: 'Run npm package and registry chores.',
  epilog: `Exit codes:
  0    The command succeeded, or help or version was printed
  1    A check failed, the listing, the publish, or the move failed, the confirmation was declined, or thor-npm hit
       an internal error
  2    Usage or validation error
  127  npm is not on PATH`,
  commands: {
    'list-packages': defineCommand({
      summary: "List a pnpm workspace's packages and whether each can be published",
      description: LIST_PACKAGES_DESCRIPTION,
      epilog: LIST_PACKAGES_EPILOG,
      flags: {
        json: { type: 'boolean', description: 'Print the packages as JSON' },
      },
      run: ({ context, flags, stderr, stdout }) => {
        const cwd = context.cwd();
        const output = renderListPackages(listWorkspacePackages(cwd), {
          cwd,
          json: flags.json,
          maxWidth: resolveMaxWidth(context),
        });
        return writeOutput(output, { stderr, stdout });
      },
    }),
    'move-trust': defineCommand({
      summary: "Move a package's trusted publisher to another GitHub repository",
      description: MOVE_TRUST_DESCRIPTION,
      epilog: MOVE_TRUST_EPILOG,
      flags: {
        dryRun: {
          type: 'boolean',
          description: 'List the trust and print the summary, but change nothing',
          short: 'n',
        },
        file: {
          type: 'string',
          description: "Workflow file name for the new trust (default: the old trust's)",
          valueHint: 'workflow',
        },
        force: { type: 'boolean', description: 'Move without asking for confirmation', short: 'f' },
        from: { type: 'string', description: 'Repository that holds the trust now', valueHint: 'owner/repo' },
        to: { type: 'string', description: 'Repository that takes the trust', valueHint: 'owner/repo' },
      },
      operands: [{ name: 'package-name', description: 'The package whose trusted publisher moves' }],
      run: ({ context, flags, operands, stderr }) =>
        executeMoveTrust({ ...flags, name: operands['package-name'] }, context, stderr),
    }),
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
        executePublishPlaceholder({ ...flags, name: operands['package-name'] }, context, stderr),
    }),
  },
});

/**
 * Runs the `thor-npm` command line, writing to the given writers and resolving to the exit code rather than
 * exiting, so that the whole surface is exercisable without a process. An empty argv prints the help. A usage error
 * is reported through the writers with exit 2, and a workspace manifest that cannot be read with exit 1; any other
 * error propagates to the caller.
 */
export async function run(args: readonly string[], effects: RunEffects, streams: RunStreams): Promise<number> {
  return runCli(args.length === 0 ? ['--help'] : args, ROOT, {
    name: 'thor-npm',
    context: effects,
    version: () => effects.resolveVersion(),
    stdout: streams.stdout,
    stderr: streams.stderr,
  });
}

/** The effects that listing packages reads from the process. */
export interface ListPackagesEffects {
  readonly cwd: () => string;
  readonly isStdoutTty: () => boolean;
  /** The terminal's width in columns, or `undefined` when stdout does not report one. */
  readonly stdoutColumns: () => number | undefined;
}

/** The effects deferred to the entry point, which keeps the runner free of process I/O. */
export interface RunEffects
  extends ListPackagesEffects, PlanMoveTrustEffects, PlanPublishPlaceholderEffects, PublishPlaceholderEffects {
  /** Asks a question on stderr and resolves to the line typed in answer, or undefined at the end of input. */
  readonly readAnswer: (question: string) => Promise<string | undefined>;
  readonly resolveVersion: () => string;
}

/** The writers that receive the command's output. */
export interface RunStreams {
  readonly stderr: Writer;
  readonly stdout: Writer;
}

// region | Helpers

/**
 * Checks a trust move and writes the summary, then moves the trust once the run is confirmed: by an answer, or by
 * `force`. A dry run stops after the summary. When the add fails, the line that announces the restore is written
 * before the restore runs, because its npm call is attached to the terminal and may prompt.
 */
async function executeMoveTrust(options: MoveTrustOptions, effects: RunEffects, stderr: Writer): Promise<number> {
  const plan = planMoveTrust(options, effects);
  if (plan.kind !== 'ready') return writeOutput(renderMoveRefusal(plan), { stderr });

  stderr.write(renderMoveSummary(plan, options.dryRun));
  if (options.dryRun) return writeOutput(renderMoveStop('dry-run'), { stderr });

  if (!options.force) {
    const answer = await effects.readAnswer(
      `Move the trusted publisher of ${plan.name} to ${plan.newTrust.repository}? [y/N] `,
    );
    if (!isAffirmative(answer)) return writeOutput(renderMoveStop('declined'), { stderr });
  }

  const outcome = applyMoveTrust(plan, effects);
  if (outcome.kind !== 'add-failed') return writeOutput(renderMoveOutcome(plan, outcome), { stderr });

  stderr.write(renderRestoring(plan, outcome.detail));
  return writeOutput(renderRestoreOutcome(plan, restoreTrust(plan, effects)), { stderr });
}

/**
 * Checks a placeholder publish and writes the summary, then publishes once the run is confirmed: by an answer, or
 * by `force`. A dry run stops after the summary.
 */
async function executePublishPlaceholder(
  options: PublishPlaceholderOptions,
  effects: RunEffects,
  stderr: Writer,
): Promise<number> {
  const plan = planPublishPlaceholder(options, effects);
  if (plan.kind !== 'ready') return writeOutput(renderPublishRefusal(plan), { stderr });

  stderr.write(renderPlaceholderSummary(plan.name, options.dryRun));
  if (options.dryRun) return writeOutput(renderPlaceholderStop('dry-run'), { stderr });

  if (!options.force) {
    const answer = await effects.readAnswer(`Publish ${plan.name}@${PLACEHOLDER_VERSION}? [y/N] `);
    if (!isAffirmative(answer)) return writeOutput(renderPlaceholderStop('declined'), { stderr });
  }

  return writeOutput(renderPublishOutcome(publishPlaceholder(plan.name, effects)), { stderr });
}

/** Returns the width to which table lines are cut: none off a terminal, and at most 120 columns on one. */
function resolveMaxWidth(effects: ListPackagesEffects): number | undefined {
  if (!effects.isStdoutTty()) return undefined;

  return Math.min(MAX_TABLE_WIDTH, effects.stdoutColumns() ?? MAX_TABLE_WIDTH);
}

/** Writes a rendered output to its streams and returns its exit code. */
function writeOutput(output: RenderedOutput, streams: { readonly stderr: Writer; readonly stdout?: Writer }): number {
  if (output.stderr !== '') streams.stderr.write(output.stderr);
  if (output.stdout !== '') streams.stdout?.write(output.stdout);
  return output.exitCode;
}

// endregion | Helpers
