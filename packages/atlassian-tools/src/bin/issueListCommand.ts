import { listIssueSummaries } from '@williamthorsen/toolbelt.atlassian/candidate';
import { type Command, createCli } from '@williamthorsen/toolbelt.cli/candidate';

import { composeIssueListJql, ISSUE_STATES } from './composeIssueListJql.ts';
import { createSubcommandRequest, CREDENTIAL_OPTIONS } from './createSubcommandRequest.ts';
import { type LoadedProjectSpec, loadProjectSpec } from './loadProjectSpec.ts';
import { renderIssueList } from './renderIssueList.ts';
import { EXIT_OK, reportFailures, type RunEffects } from './subcommand-support.ts';

const DEFAULT_LIMIT = 20;

const { defineCommand } = createCli<RunEffects>();

/**
 * The `issue list` command: It resolves the project and the credential, searches the project's work items, and
 * prints one line for each.
 *
 * @internal
 */
export const issueListCommand: Command<RunEffects> = defineCommand({
  summary: "List a project's work items, newest first",
  description: "List a Jira project's work items, newest first, one per line: key, status, and summary.",
  epilog: `\`open\` lists the work items outside the Done status category, \`closed\` those in it, and \`all\` both.

The spec is optional here. When the upward search finds no \`jira-project-spec.json\`, the project, site, and
email come from the flags and the environment alone.

Resolution orders, each stopping at the first source that supplies a value:
  project  --project, then the spec's \`projectKey\`
  site     --site, then JIRA_SITE, then the spec's \`site\`
  email    --email, then JIRA_EMAIL, then the spec's \`email\`
  token    --token-stdin, then JIRA_API_TOKEN, then --token-command, then the macOS keychain`,
  flags: {
    ...CREDENTIAL_OPTIONS,
    limit: {
      type: 'string',
      description: 'Maximum number of work items to list',
      short: 'L',
      valueHint: 'n',
      parse: parseLimit,
      default: DEFAULT_LIMIT,
    },
    project: { type: 'string', description: "Project key, rather than the spec's `projectKey`", valueHint: 'key' },
    state: { type: 'string', description: 'Which work items to list', choices: ISSUE_STATES, default: 'open' },
  },
  run: ({ context: effects, flags, stderr }) =>
    reportFailures(stderr, async () => {
      const loaded = loadProjectSpec(effects, flags.spec);
      const projectKey = selectProjectKey(flags.project, loaded, effects.cwd());

      const request = await createSubcommandRequest(effects, flags, loaded?.spec);
      const jql = composeIssueListJql({ projectKey, state: flags.state });
      const summaries = await listIssueSummaries(request, { jql, limit: flags.limit });
      if (summaries.length > 0) effects.write(`${renderIssueList(summaries)}\n`);

      return EXIT_OK;
    }),
});

// region | Helpers

/** Reads `--limit`, which is a positive integer written in decimal digits. */
function parseLimit(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new Error('--limit takes a positive integer.');

  return Number(value);
}

/** Chooses the project to list, naming the sources that it checked when neither supplies one. */
function selectProjectKey(flag: string | undefined, loaded: LoadedProjectSpec | undefined, cwd: string): string {
  if (flag !== undefined && flag !== '') return flag;
  if (loaded?.spec.projectKey !== undefined) return loaded.spec.projectKey;

  const specSource =
    loaded === undefined
      ? `the search found no jira-project-spec.json at or above ${cwd}`
      : `${loaded.path} does not set \`projectKey\``;

  throw new Error(`A project key is required: pass --project, or set \`projectKey\` in the spec; ${specSource}.`);
}

// endregion | Helpers
