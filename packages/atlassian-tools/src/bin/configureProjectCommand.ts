import {
  applyBoardFeatures,
  applyWorkflowUpdate,
  buildReconciliationPlan,
  buildVerificationReport,
  DEFAULT_TOKEN_SERVICE,
  listIssueKeys,
  moveIssuesToBacklog,
  readBoardColumnReport,
  readProjectConfiguration,
} from '@williamthorsen/toolbelt.atlassian/candidate';
import { type Command, createCli } from '@williamthorsen/toolbelt.cli/candidate';

import { createSubcommandRequest, CREDENTIAL_OPTIONS, type CredentialValues } from './createSubcommandRequest.ts';
import { formatContinuationLine, formatLabelledLine } from './labelled-lines.ts';
import { type LoadedProjectSpec, loadProjectSpec } from './loadProjectSpec.ts';
import { renderPlan } from './renderPlan.ts';
import { renderVerification } from './renderVerification.ts';
import { EXIT_MISMATCH, EXIT_OK, reportFailures, type RunEffects } from './subcommand-support.ts';

const { defineCommand } = createCli<RunEffects>();

/**
 * What `POST /rest/agile/1.0/board/{boardId}/issue` accepts in one call, which bounds the undo that the
 * seed prints.
 */
const BOARD_MOVE_LIMIT = 50;

const CONFIGURE_DESCRIPTION = `Reconcile a Jira project's statuses, workflow transitions, and board features against a declarative spec, then
report what the server stores afterwards. The run is idempotent: A project already matching the spec is left
untouched.`;

const CONFIGURE_EPILOG = `The spec is the consuming repo's file, found by ascending from the working directory for
\`jira-project-spec.json\`; \`--spec\` names one directly.

Resolution orders, each stopping at the first source that supplies a value:
  project  <key>, then the spec's \`projectKey\`
  site     --site, then JIRA_SITE, then the spec's \`site\`
  email    --email, then JIRA_EMAIL, then the spec's \`email\`
  token    --token-stdin, then JIRA_API_TOKEN, then --token-command, then the macOS keychain

The token is read from the keychain under the service \`${DEFAULT_TOKEN_SERVICE}\`, with the email as the
account. Store one with \`thor-jira auth set\`. The base URL is the \`api.atlassian.com\` gateway, whose cloudId
is read from the site without authentication.

Jira Cloud and team-managed projects only. A company-managed project is refused rather than reconciled: A
status renamed there is renamed in every project on the site that uses it.

Board columns cannot be set through the public API. The closing report names any spec status mapped to no
column, and any column order differing from the spec's; both are fixed by dragging in the board settings.

A board feature locked by Jira is reported as \`locked\` in the plan and \`LOCK\` in the closing report, and is
never written: The call would return 200 and change nothing. Neither it nor a column gap affects the exit code.`;

/**
 * The `configure-project` command: It resolves the credential, plans the reconciliation against the project's live
 * configuration, writes what the plan contains, and reports what the server stores afterwards.
 *
 * @internal
 */
export const configureProjectCommand: Command<RunEffects> = defineCommand({
  summary: "Reconcile a project's statuses, workflow, and board features against a spec",
  description: CONFIGURE_DESCRIPTION,
  epilog: CONFIGURE_EPILOG,
  flags: {
    ...CREDENTIAL_OPTIONS,
    dryRun: { type: 'boolean', description: 'Print the plan and write nothing' },
    seedBacklog: {
      type: 'string',
      description: 'Move every work item in that status off the board and into the backlog',
      valueHint: 'name',
    },
  },
  operands: [{ name: 'key', description: "The project key; the spec's `projectKey` when omitted", optional: true }],
  run: ({ context: effects, flags, operands, stderr }) =>
    reportFailures(stderr, async () => await configureProject(effects, flags, operands.key)),
});

// region | Helpers

/** Reconciles the project and reports the outcome, returning the exit code. */
async function configureProject(
  effects: RunEffects,
  values: CredentialValues & { dryRun: boolean; seedBacklog: string | undefined; spec: string | undefined },
  keyOperand: string | undefined,
): Promise<number> {
  const seedBacklog = values.seedBacklog;
  const loaded = loadProjectSpec(effects, values.spec);
  if (loaded === undefined) {
    throw new Error(`No jira-project-spec.json at or above ${effects.cwd()}. Name one with --spec.`);
  }
  const { spec } = loaded;
  const projectKey = selectProjectKey(keyOperand, loaded);

  const request = await createSubcommandRequest(effects, values, spec);

  const configuration = await readProjectConfiguration(request, projectKey);
  const plan = buildReconciliationPlan(spec, configuration);
  effects.write(`${renderPlan(plan, configuration, { projectKey, seedBacklog })}\n`);

  if (values.dryRun) {
    effects.write('\ndry run: Nothing was written\n');

    return EXIT_OK;
  }

  const { correctedStatuses, written } = await applyWorkflowUpdate(request, configuration, plan);
  const workflowOutcome = written
    ? `updated: ${plan.statusUpdates.length} amended, ${plan.creations.length} created`
    : 'unchanged';
  effects.write(`${formatLabelledLine('workflow', workflowOutcome)}\n`);
  if (correctedStatuses.length > 0) {
    const corrections = correctedStatuses.map((status) => `${status.from} → ${status.to}`).join(', ');
    effects.write(`amended via the status API: ${corrections}\n`);
  }

  const toggles = await applyBoardFeatures(request, configuration, plan);
  for (const toggle of toggles) {
    effects.write(`${formatLabelledLine('feature', `${toggle.feature} → ${toggle.to}`)}\n`);
  }

  if (seedBacklog !== undefined) await seedTheBacklog(request, configuration, effects, projectKey, seedBacklog);

  const after = await readProjectConfiguration(request, projectKey);
  const report = buildVerificationReport(after, spec);
  effects.write(`\n${renderVerification(report, await readBoardColumnReport(request, after, spec))}\n`);

  return report.matches ? EXIT_OK : EXIT_MISMATCH;
}

/** Chooses the project to reconcile: the operand, or else the spec's `projectKey`. */
function selectProjectKey(projectKey: string | undefined, loaded: LoadedProjectSpec): string {
  if (projectKey !== undefined && projectKey !== '') return projectKey;
  if (loaded.spec.projectKey !== undefined) return loaded.spec.projectKey;

  throw new Error(
    `A project key is required: pass it as an argument, or set \`projectKey\` in the spec; ${loaded.path} does not set \`projectKey\`.`,
  );
}

/** Moves every work item in one status off the board, reporting the call that puts them back. */
async function seedTheBacklog(
  request: Parameters<typeof listIssueKeys>[0],
  configuration: { board: { id: number } },
  effects: RunEffects,
  projectKey: string,
  status: string,
): Promise<void> {
  const jql = `project = "${projectKey}" AND status = "${status}"`;
  const keys = await listIssueKeys(request, jql);
  if (keys.length === 0) {
    effects.write(`${formatLabelledLine('backlog', `no '${status}' work items to move`)}\n`);

    return;
  }

  const { moved } = await moveIssuesToBacklog(request, configuration.board.id, keys);
  effects.write(`${formatLabelledLine('backlog', `moved ${moved} '${status}' work items off the board`)}\n`);
  // The run prints no keys, and a move leaves an item's status alone, so the query still selects the same set.
  effects.write(
    `${formatContinuationLine(`undo: POST /rest/agile/1.0/board/${configuration.board.id}/issue, ${BOARD_MOVE_LIMIT} keys per call`)}\n`,
  );
  effects.write(`${formatContinuationLine(`keys: ${jql}`)}\n`);
}

// endregion | Helpers
