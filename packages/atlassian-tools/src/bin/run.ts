import { createCli, runCli } from '@williamthorsen/toolbelt.cli/candidate';

import { authCommand } from './authCommand.ts';
import { configureProjectCommand } from './configureProjectCommand.ts';
import { issueGroup } from './issueGroup.ts';
import { PROGRAM_NAME } from './reportFailures.ts';
import type { RunEffects } from './RunEffects.ts';

const { defineGroup } = createCli<RunEffects>();

const ROOT = defineGroup({
  summary:
    'Reconcile a Jira Cloud project against a declarative spec, list its work items, and manage the API token with which it authenticates.',
  epilog: `Exit codes:
  0  The command succeeded
  1  No token is stored, nothing was there to remove, or thor-jira hit an internal error
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
 * An anticipated failure is reported through the effects: a usage error, which includes an invalid setting, spec, or
 * prompt, with exit 2, a keychain that cannot be reached with exit 3, a request that Jira rejects or answers
 * unexpectedly with exit 4, and a request that never reached Jira with exit 6. Any other error propagates to the
 * caller.
 *
 * @internal
 */
export async function run(args: string[], effects: RunEffects): Promise<number> {
  return await runCli(args, ROOT, {
    name: PROGRAM_NAME,
    context: effects,
    version: () => effects.resolveVersion(),
    stdout: { write: effects.write },
    stderr: { write: effects.writeError },
  });
}
