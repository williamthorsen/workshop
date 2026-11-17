import type { ProjectSpec } from '@williamthorsen/toolbelt.atlassian/candidate';
import { describe, expect, it } from 'vitest';

import { createFakeRequest } from '../../test-utils/createFakeRequest.ts';
import { type ConfigureStep, type ReconcileInputs, reconcileProject } from '../reconcileProject.ts';
import { BOARD_ID, buildProjectRoutes, PROJECT_KEY } from '../test-utils/buildProjectRoutes.ts';

const CONFORMANT_SPEC: ProjectSpec = {
  boardFeatures: { 'jsw.agility.backlog': 'DISABLED' },
  statuses: [
    { category: 'TODO', name: 'To Do' },
    { category: 'DONE', name: 'Done' },
  ],
};

describe(reconcileProject, () => {
  it('reports the plan and the dry run, and calls nothing that writes', async () => {
    const { calls, steps, outcome } = await runReconcile({ dryRun: true, seedBacklog: 'To Do' });

    expect(outcome).toStrictEqual({ kind: 'dry-run' });
    expect(steps.map((step) => step.kind)).toStrictEqual(['plan', 'dry-run']);
    expect(steps[0]).toMatchObject({ kind: 'plan', projectKey: PROJECT_KEY, seedBacklog: 'To Do' });
    expect(calls.every((call) => call.method === 'GET' || call.path.startsWith('/rest/api/3/workflows?'))).toBe(true);
  });

  it('reports every step of a real run in the order in which it completes', async () => {
    const { steps, outcome } = await runReconcile({ seedBacklog: 'To Do' });

    expect(outcome).toStrictEqual({ kind: 'verified', matches: true });
    expect(steps.map((step) => step.kind)).toStrictEqual(['plan', 'workflow', 'features', 'backlog', 'verification']);
    expect(steps[1]).toStrictEqual({ amended: 0, correctedStatuses: [], created: 0, kind: 'workflow', written: false });
    expect(steps[2]).toStrictEqual({ kind: 'features', toggles: [] });
    expect(steps[3]).toStrictEqual({
      boardId: BOARD_ID,
      found: 2,
      jql: `project = "${PROJECT_KEY}" AND status = "To Do"`,
      kind: 'backlog',
      moved: 2,
      status: 'To Do',
    });
  });

  it('reports an empty seed without moving anything', async () => {
    const { calls, steps } = await runReconcile(
      { seedBacklog: 'To Do' },
      { 'POST /rest/api/3/search/jql': { json: { issues: [] } } },
    );

    expect(steps.find((step) => step.kind === 'backlog')).toMatchObject({ found: 0, moved: 0 });
    expect(calls.some((call) => call.path.includes('/backlog/'))).toBe(false);
  });

  it('omits the backlog step when the run was not asked to seed', async () => {
    const { steps } = await runReconcile({});

    expect(steps.map((step) => step.kind)).not.toContain('backlog');
  });

  it('reports a verification that misses as an outcome that does not match', async () => {
    const { outcome } = await runReconcile({
      spec: {
        statuses: [{ aliases: ['To Do'], category: 'TODO', name: 'Todo' }, ...CONFORMANT_SPEC.statuses.slice(1)],
      },
    });

    expect(outcome).toStrictEqual({ kind: 'verified', matches: false });
  });
});

// region | Helpers

/** Reconciles the fake project, collecting every step that the run reports. */
async function runReconcile(
  inputs: Partial<ReconcileInputs>,
  routes: Parameters<typeof createFakeRequest>[0] = {},
): Promise<{
  calls: ReturnType<typeof createFakeRequest>['calls'];
  outcome: Awaited<ReturnType<typeof reconcileProject>>;
  steps: ConfigureStep[];
}> {
  const { calls, request } = createFakeRequest({ ...buildProjectRoutes(), ...routes });
  const steps: ConfigureStep[] = [];
  const outcome = await reconcileProject(
    request,
    { dryRun: false, projectKey: PROJECT_KEY, seedBacklog: undefined, spec: CONFORMANT_SPEC, ...inputs },
    (step) => {
      steps.push(step);
    },
  );

  return { calls, outcome, steps };
}

// endregion | Helpers
