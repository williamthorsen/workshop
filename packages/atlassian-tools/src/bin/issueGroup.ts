import { createCli, type Group } from '@williamthorsen/toolbelt.cli/candidate';

import { issueListCommand } from './issueListCommand.ts';
import type { RunEffects } from './subcommand-support.ts';

const { defineGroup } = createCli<RunEffects>();

/**
 * The `issue` command group, which works with a Jira project's work items.
 *
 * @internal
 */
export const issueGroup: Group<RunEffects> = defineGroup({
  summary: "List a project's work items",
  description: "Work with a Jira project's work items.",
  commands: { list: issueListCommand },
});
