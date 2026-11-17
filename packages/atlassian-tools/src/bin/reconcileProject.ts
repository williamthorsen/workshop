import {
  applyBoardFeatures,
  applyWorkflowUpdate,
  type BoardColumnReport,
  buildReconciliationPlan,
  buildVerificationReport,
  type FeatureToggle,
  type JiraRequest,
  listIssueKeys,
  moveIssuesToBacklog,
  type ProjectConfiguration,
  type ProjectSpec,
  readBoardColumnReport,
  readProjectConfiguration,
  type ReconciliationPlan,
  type StatusUpdate,
  type VerificationReport,
} from '@williamthorsen/toolbelt.atlassian/candidate';

import { quoteJqlValue } from './quoteJqlValue.ts';

/**
 * Reconciles a project against its spec, reporting each step as it completes so that a run killed partway still
 * leaves a record of what it did. Composes and writes nothing.
 *
 * @internal
 */
export async function reconcileProject(
  request: JiraRequest,
  inputs: ReconcileInputs,
  report: (step: ConfigureStep) => void,
): Promise<ReconcileOutcome> {
  const { projectKey, seedBacklog, spec } = inputs;

  const configuration = await readProjectConfiguration(request, projectKey);
  const plan = buildReconciliationPlan(spec, configuration);
  report({ configuration, kind: 'plan', plan, projectKey, seedBacklog });

  if (inputs.dryRun) {
    report({ kind: 'dry-run' });

    return { kind: 'dry-run' };
  }

  const { correctedStatuses, written } = await applyWorkflowUpdate(request, configuration, plan);
  report({
    amended: plan.statusUpdates.length,
    correctedStatuses,
    created: plan.creations.length,
    kind: 'workflow',
    written,
  });

  report({ kind: 'features', toggles: await applyBoardFeatures(request, configuration, plan) });

  if (seedBacklog !== undefined) report(await seedTheBacklog(request, configuration, projectKey, seedBacklog));

  const after = await readProjectConfiguration(request, projectKey);
  const verification = buildVerificationReport(after, spec);
  report({ columns: await readBoardColumnReport(request, after, spec), kind: 'verification', report: verification });

  return { kind: 'verified', matches: verification.matches };
}

/**
 * One completed step of a reconciliation.
 *
 * @internal
 */
export type ConfigureStep =
  | { readonly kind: 'dry-run' }
  | {
      readonly kind: 'backlog';
      readonly boardId: number;
      readonly found: number;
      /** The query that selected the work items, which still selects them after the move. */
      readonly jql: string;
      readonly moved: number;
      readonly status: string;
    }
  | { readonly kind: 'features'; readonly toggles: readonly FeatureToggle[] }
  | {
      readonly kind: 'plan';
      readonly configuration: ProjectConfiguration;
      readonly plan: ReconciliationPlan;
      readonly projectKey: string;
      readonly seedBacklog: string | undefined;
    }
  | { readonly kind: 'verification'; readonly columns: BoardColumnReport; readonly report: VerificationReport }
  | {
      readonly kind: 'workflow';
      readonly amended: number;
      readonly correctedStatuses: readonly StatusUpdate[];
      readonly created: number;
      readonly written: boolean;
    };

/**
 * What the command resolves before a reconciliation starts.
 *
 * @internal
 */
export interface ReconcileInputs {
  readonly dryRun: boolean;
  readonly projectKey: string;
  /** The status whose work items move off the board, when the run was asked to seed the backlog. */
  readonly seedBacklog: string | undefined;
  readonly spec: ProjectSpec;
}

/**
 * How a reconciliation ended, from which the command chooses its exit code.
 *
 * @internal
 */
export type ReconcileOutcome = { readonly kind: 'dry-run' } | { readonly kind: 'verified'; readonly matches: boolean };

// region | Helpers

/** Moves every work item in one status off the board, returning the step that records the move. */
async function seedTheBacklog(
  request: JiraRequest,
  configuration: Pick<ProjectConfiguration, 'board'>,
  projectKey: string,
  status: string,
): Promise<ConfigureStep> {
  const boardId = configuration.board.id;
  const jql = `project = ${quoteJqlValue(projectKey)} AND status = ${quoteJqlValue(status)}`;
  const keys = await listIssueKeys(request, jql);
  const moved = keys.length === 0 ? 0 : (await moveIssuesToBacklog(request, boardId, keys)).moved;

  return { boardId, found: keys.length, jql, kind: 'backlog', moved, status };
}

// endregion | Helpers
