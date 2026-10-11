import { createCli, runCli, UsageError } from '@williamthorsen/toolbelt.cli/candidate';

import { authCommand } from './authCommand.ts';
import { configureProjectCommand } from './configureProjectCommand.ts';
import { issueGroup } from './issueGroup.ts';
import { describeError, type RunEffects } from './subcommand-support.ts';

const { defineGroup } = createCli<RunEffects>();

const ROOT = defineGroup({
  summary:
    'Reconcile a Jira Cloud project against a declarative spec, list its work items, and manage the API token with which it authenticates.',
  epilog: `Exit codes:
  0  The command succeeded
  1  No token is stored, or nothing was there to remove
  2  Usage or validation error
  3  The keychain could not be reached
  4  A Jira request failed, or its response could not be read
  5  The run wrote, but the project does not match the spec
  6  Jira could not be reached

Jira Cloud and team-managed projects only.`,
  commands: {
    auth: authCommand,
    'configure-project': configureProjectCommand,
    issue: issueGroup,
  },
});

/**
 * Runs the `thor-jira` command line, writing through the effects that it is given and returning the code to exit
 * with. Output streams as the run proceeds, so a process killed partway still leaves a record of what it did.
 * Every failure is reported through the effects: Nothing throws.
 *
 * @internal
 */
export async function run(args: string[], effects: RunEffects): Promise<number> {
  return await runCli(args, ROOT, {
    name: 'thor-jira',
    context: effects,
    version: () => resolveVersion(effects),
    stdout: { write: effects.write },
    stderr: { write: effects.writeError },
  });
}

// region | Helpers

/** Resolves the installed version, reporting a failure as a usage error, which exits 2. */
function resolveVersion(effects: { readonly resolveVersion: () => string }): string {
  try {
    return effects.resolveVersion();
  } catch (error) {
    throw new UsageError(describeError(error), { cause: error });
  }
}

// endregion | Helpers
