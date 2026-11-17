import type {
  BoardColumnReport,
  ReconciliationPlan,
  StatusUpdate,
  VerificationReport,
} from '@williamthorsen/toolbelt.atlassian/candidate';
import { describe, expect, it } from 'vitest';

import { buildProjectConfiguration } from '../../test-utils/projectConfiguration.ts';
import type { ConfigureStep } from '../reconcileProject.ts';
import { renderConfigureStep } from '../renderConfigureStep.ts';
import { renderPlan } from '../renderPlan.ts';
import { renderVerification } from '../renderVerification.ts';

const PLAN: ReconciliationPlan = {
  creations: [],
  featureToggles: [],
  lockedFeatures: [],
  statusUpdates: [],
  transitionRenames: [],
  unmanaged: [],
};

describe(renderConfigureStep, () => {
  it('renders the plan as the plan renderer composes it', () => {
    const configuration = buildProjectConfiguration();

    expect(
      renderConfigureStep({ configuration, kind: 'plan', plan: PLAN, projectKey: 'PROJ', seedBacklog: 'To Do' }),
    ).toBe(`${renderPlan(PLAN, configuration, { projectKey: 'PROJ', seedBacklog: 'To Do' })}\n`);
  });

  it('renders the dry run as a notice below a blank line', () => {
    expect(renderConfigureStep({ kind: 'dry-run' })).toBe('\ndry run: Nothing was written\n');
  });

  it('renders a workflow that was not written as unchanged', () => {
    expect(renderConfigureStep(buildWorkflowStep({ written: false }))).toBe('workflow  unchanged\n');
  });

  it('renders a written workflow with its counts and each status that the status API amended', () => {
    const rendered = renderConfigureStep(
      buildWorkflowStep({
        amended: 2,
        correctedStatuses: [buildStatusUpdate('To Do', 'Todo'), buildStatusUpdate('Doing', 'In progress')],
        created: 1,
        written: true,
      }),
    );

    expect(rendered).toBe(
      'workflow  updated: 2 amended, 1 created\namended via the status API: To Do → Todo, Doing → In progress\n',
    );
  });

  it('renders one line per feature toggle, and nothing when the run toggled none', () => {
    expect(
      renderConfigureStep({
        kind: 'features',
        toggles: [
          { feature: 'jsw.agility.backlog', from: 'DISABLED', to: 'ENABLED' },
          { feature: 'jsw.agility.sprints', from: undefined, to: 'DISABLED' },
        ],
      }),
    ).toBe('feature   jsw.agility.backlog → ENABLED\nfeature   jsw.agility.sprints → DISABLED\n');
    expect(renderConfigureStep({ kind: 'features', toggles: [] })).toBe('');
  });

  it('renders a seed that moved work items with the call that undoes it and the query that recovers the keys', () => {
    const jql = 'project = "PROJ" AND status = "To Do"';

    expect(renderConfigureStep({ boardId: 7, found: 3, jql, kind: 'backlog', moved: 3, status: 'To Do' })).toBe(
      [
        "backlog   moved 3 'To Do' work items off the board",
        '          undo: POST /rest/agile/1.0/board/7/issue, 50 keys per call',
        `          keys: ${jql}`,
        '',
      ].join('\n'),
    );
  });

  it('renders a seed whose query found nothing without an undo', () => {
    expect(renderConfigureStep({ boardId: 7, found: 0, jql: '', kind: 'backlog', moved: 0, status: 'To Do' })).toBe(
      "backlog   no 'To Do' work items to move\n",
    );
  });

  it('renders the verification below a blank line, as the verification renderer composes it', () => {
    const columns: BoardColumnReport = { columns: ['To Do', 'Done'], order: undefined, uncovered: [] };
    const report: VerificationReport = { features: [], matches: true, statuses: [] };

    expect(renderConfigureStep({ columns, kind: 'verification', report })).toBe(
      `\n${renderVerification(report, columns)}\n`,
    );
  });
});

// region | Helpers

/** Builds a status update that renames one status and leaves its category alone. */
function buildStatusUpdate(from: string, to: string): StatusUpdate {
  return { category: 'TODO', description: '', from, fromCategory: 'TODO', id: `id-${from}`, statusReference: from, to };
}

/** Builds a workflow step that wrote nothing, with the given fields replaced. */
function buildWorkflowStep(
  overrides: Partial<Omit<Extract<ConfigureStep, { kind: 'workflow' }>, 'kind'>>,
): ConfigureStep {
  return { amended: 0, correctedStatuses: [], created: 0, kind: 'workflow', written: false, ...overrides };
}

// endregion | Helpers
