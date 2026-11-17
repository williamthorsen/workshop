import type {
  ProjectConfiguration,
  Workflow,
  WorkflowStatus,
  WorkflowTransition,
} from '@williamthorsen/toolbelt.atlassian/candidate';

/**
 * Builds a project configuration around a three-status workflow, each status reachable through a global
 * transition named for it, which is the shape from which a team-managed project starts.
 */
export function buildProjectConfiguration(overrides: Partial<ProjectConfiguration> = {}): ProjectConfiguration {
  const statuses = overrides.statuses ?? buildStatuses();

  return {
    board: { id: 1 },
    features: new Map([['jsw.agility.backlog', 'DISABLED']]),
    lockedFeatures: new Set<string>(),
    project: { id: '10000' },
    statuses,
    workflow: buildWorkflow(statuses),
    ...overrides,
  };
}

/** Builds one full status object, as the workflow read reports it. */
export function buildStatus(overrides: Partial<WorkflowStatus> & Pick<WorkflowStatus, 'name'>): WorkflowStatus {
  const reference = overrides.statusReference ?? `ref-${overrides.name.toLowerCase().replaceAll(' ', '-')}`;

  return {
    description: '',
    id: reference.replace('ref-', 'id-'),
    statusCategory: 'TODO',
    statusReference: reference,
    ...overrides,
  };
}

/** Builds the `To Do`, `In Progress`, and `Done` statuses with which a team-managed project starts. */
export function buildStatuses(): WorkflowStatus[] {
  return [
    buildStatus({ name: 'To Do', statusCategory: 'TODO' }),
    buildStatus({ name: 'In Progress', statusCategory: 'IN_PROGRESS' }),
    buildStatus({ name: 'Done', statusCategory: 'DONE' }),
  ];
}

/**
 * Builds one transition, with a `conditions` field that this package does not model. The workflow write replaces
 * the graph wholesale, so a transition sent without such a field loses it.
 */
export function buildTransition(
  overrides: Partial<WorkflowTransition> & Pick<WorkflowTransition, 'id' | 'name'>,
): WorkflowTransition {
  return {
    conditions: { conditionGroups: [], operation: 'ALL' },
    type: 'GLOBAL',
    ...overrides,
  };
}

/** Builds the workflow graph reaching each status through a global transition named for it. */
export function buildWorkflow(statuses: readonly WorkflowStatus[]): Workflow {
  return {
    description: 'The project workflow.',
    id: 'workflow-1',
    name: 'PROJ: Software Simplified Workflow',
    startPointLayout: { x: 0, y: 0 },
    statuses: statuses.map((status) => ({ layout: { x: 0, y: 0 }, statusReference: status.statusReference })),
    transitions: statuses.map((status, index) =>
      buildTransition({
        id: String((index + 1) * 10),
        name: status.name,
        toStatusReference: status.statusReference,
      }),
    ),
    version: { id: 'version-1', versionNumber: 1 },
  };
}
