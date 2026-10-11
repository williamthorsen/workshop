import type { ReconciliationPlan } from '@williamthorsen/toolbelt.atlassian/candidate';
import { describe, expect, it } from 'vitest';

import { buildProjectConfiguration, buildStatus } from '../../test-utils/projectConfiguration.ts';
import { renderPlan } from '../renderPlan.ts';

const CONFIGURATION = buildProjectConfiguration();
const PROJECT_KEY = 'PROJ';

describe(renderPlan, () => {
  it('leads with the project, board, and workflow against which the plan was built', () => {
    const rendered = renderPlan(buildPlan(), CONFIGURATION, { projectKey: PROJECT_KEY });

    expect(rendered).toContain('project   PROJ (id 10000), board 1');
    expect(rendered).toContain('workflow  PROJ: Software Simplified Workflow');
  });

  it('starts the text of every line in one column, the unmanaged line included', () => {
    const rendered = renderPlan(
      buildPlan({
        creations: [{ category: 'IN_PROGRESS', name: 'Waiting', statusReference: 'ref-waiting' }],
        featureToggles: [{ feature: 'jsw.agility.backlog', from: 'DISABLED', to: 'ENABLED' }],
        lockedFeatures: [{ feature: 'jsw.agility.goals', from: 'DISABLED', to: 'ENABLED' }],
        statusUpdates: [
          {
            category: 'TODO',
            description: '',
            from: 'To Do',
            fromCategory: 'TODO',
            id: 'id-1',
            statusReference: 'ref-1',
            to: 'Todo',
          },
        ],
        transitionRenames: [{ from: 'To Do', id: '10', to: 'Todo' }],
        unmanaged: [buildStatus({ name: 'Legacy' })],
      }),
      CONFIGURATION,
      { projectKey: PROJECT_KEY, seedBacklog: 'To Do' },
    );
    const lines = rendered.split('\n');
    const columns = new Set(lines.map((line) => /^\S+ +/.exec(line)?.[0].length));

    expect(lines).toHaveLength(10);
    expect([...columns]).toStrictEqual([expect.any(Number)]);
  });

  it('reports a project that already matches the spec', () => {
    expect(renderPlan(buildPlan(), CONFIGURATION, { projectKey: PROJECT_KEY })).toContain(
      'no changes: The project already matches the spec',
    );
  });

  it('names only the half of a status update that changes', () => {
    const renamed = renderPlan(
      buildPlan({
        statusUpdates: [
          {
            category: 'TODO',
            description: '',
            from: 'To Do',
            fromCategory: 'TODO',
            id: 'id-1',
            statusReference: 'ref-1',
            to: 'Todo',
          },
        ],
      }),
      CONFIGURATION,
      { projectKey: PROJECT_KEY },
    );

    expect(renamed).toContain("update    status id-1: 'To Do' → 'Todo'");
    expect(renamed).not.toContain('TODO → TODO');
  });

  it('reports a recategorized status', () => {
    const rendered = renderPlan(
      buildPlan({
        statusUpdates: [
          {
            category: 'DONE',
            description: '',
            from: 'Done',
            fromCategory: 'TODO',
            id: 'id-3',
            statusReference: 'ref-3',
            to: 'Done',
          },
        ],
      }),
      CONFIGURATION,
      { projectKey: PROJECT_KEY },
    );

    expect(rendered).toContain('update    status id-3: TODO → DONE');
  });

  it('reports the transition that a created status is reached through', () => {
    const rendered = renderPlan(
      buildPlan({ creations: [{ category: 'IN_PROGRESS', name: 'Waiting', statusReference: 'ref-waiting' }] }),
      CONFIGURATION,
      { projectKey: PROJECT_KEY },
    );

    expect(rendered).toContain("create    status 'Waiting' (IN_PROGRESS)");
    expect(rendered).toContain("create    transition GLOBAL → 'Waiting'");
  });

  it('reports a renamed transition and a board-feature toggle', () => {
    const rendered = renderPlan(
      buildPlan({
        featureToggles: [{ feature: 'jsw.agility.backlog', from: 'DISABLED', to: 'ENABLED' }],
        transitionRenames: [{ from: 'To Do', id: '10', to: 'Todo' }],
      }),
      CONFIGURATION,
      { projectKey: PROJECT_KEY },
    );

    expect(rendered).toContain("rename    transition 10: 'To Do' → 'Todo'");
    expect(rendered).toContain('toggle    jsw.agility.backlog: DISABLED → ENABLED');
  });

  it('reports a feature missing from the board as absent', () => {
    const rendered = renderPlan(
      buildPlan({ featureToggles: [{ feature: 'jsw.agility.backlog', from: undefined, to: 'ENABLED' }] }),
      CONFIGURATION,
      { projectKey: PROJECT_KEY },
    );

    expect(rendered).toContain('toggle    jsw.agility.backlog: absent → ENABLED');
  });

  it('reports an unmanaged status without counting it as a change', () => {
    const rendered = renderPlan(buildPlan({ unmanaged: [buildStatus({ name: 'Blocked' })] }), CONFIGURATION, {
      projectKey: PROJECT_KEY,
    });

    expect(rendered).toContain("unmanaged status 'Blocked' is not in the spec and will not be touched");
    expect(rendered).toContain('no changes: The project already matches the spec');
  });

  it('reports a feature locked by Jira as unsettable rather than as a change', () => {
    const rendered = renderPlan(
      buildPlan({ lockedFeatures: [{ feature: 'jsw.agility.goals', from: 'DISABLED', to: 'ENABLED' }] }),
      CONFIGURATION,
      { projectKey: PROJECT_KEY },
    );

    expect(rendered).toContain(
      'locked    jsw.agility.goals is DISABLED and Jira has locked it; ENABLED cannot be set here',
    );
  });

  it('does not report a project as matching the spec when the only difference is locked', () => {
    const rendered = renderPlan(
      buildPlan({ lockedFeatures: [{ feature: 'jsw.agility.goals', from: 'DISABLED', to: 'ENABLED' }] }),
      CONFIGURATION,
      { projectKey: PROJECT_KEY },
    );

    expect(rendered).toContain('no changes to make: Every remaining difference is locked by Jira');
    expect(rendered).not.toContain('the project already matches the spec');
  });

  it('reports the backlog seed for which the run was asked', () => {
    const rendered = renderPlan(buildPlan(), CONFIGURATION, { projectKey: PROJECT_KEY, seedBacklog: 'To Do' });

    expect(rendered).toContain("seed      move every 'To Do' work item off the board");
  });

  it('does not report a matching project as having nothing to do when a seed was asked for', () => {
    const rendered = renderPlan(buildPlan(), CONFIGURATION, { projectKey: PROJECT_KEY, seedBacklog: 'To Do' });

    expect(rendered).not.toContain('no changes');
  });

  it('does not report a locked-only difference as having nothing to do when a seed was asked for', () => {
    const rendered = renderPlan(
      buildPlan({ lockedFeatures: [{ feature: 'jsw.agility.goals', from: 'DISABLED', to: 'ENABLED' }] }),
      CONFIGURATION,
      { projectKey: PROJECT_KEY, seedBacklog: 'To Do' },
    );

    expect(rendered).not.toContain('no changes');
  });
});

// region | Helpers

/** Builds an empty plan, with the entries that a test needs. */
function buildPlan(overrides: Partial<ReconciliationPlan> = {}): ReconciliationPlan {
  return {
    creations: [],
    featureToggles: [],
    lockedFeatures: [],
    statusUpdates: [],
    transitionRenames: [],
    unmanaged: [],
    ...overrides,
  };
}

// endregion | Helpers
