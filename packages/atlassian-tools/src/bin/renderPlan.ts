import type { ProjectConfiguration, ReconciliationPlan } from '@williamthorsen/toolbelt.atlassian/candidate';

import { formatLabelledLine } from './labelled-lines.ts';

/**
 * Renders the reconciliation plan as the run's unit of review, listing every write that it would make and reporting
 * a plan that contains none. Composes a string and prints nothing.
 *
 * @internal
 */
export function renderPlan(
  plan: ReconciliationPlan,
  configuration: ProjectConfiguration,
  options: PlanRenderOptions,
): string {
  const lines = [
    formatLabelledLine(
      'project',
      `${options.projectKey} (id ${configuration.project.id}), board ${configuration.board.id}`,
    ),
    formatLabelledLine('workflow', configuration.workflow.name ?? configuration.workflow.id),
  ];

  for (const update of plan.statusUpdates) {
    lines.push(formatLabelledLine('update', `status ${update.id}: ${describeStatusUpdate(update)}`));
  }
  for (const creation of plan.creations) {
    lines.push(
      formatLabelledLine('create', `status '${creation.name}' (${creation.category})`),
      formatLabelledLine('create', `transition GLOBAL → '${creation.name}'`),
    );
  }
  for (const rename of plan.transitionRenames) {
    lines.push(formatLabelledLine('rename', `transition ${rename.id}: '${rename.from}' → '${rename.to}'`));
  }
  for (const toggle of plan.featureToggles) {
    lines.push(formatLabelledLine('toggle', `${toggle.feature}: ${toggle.from ?? 'absent'} → ${toggle.to}`));
  }
  for (const toggle of plan.lockedFeatures) {
    lines.push(
      formatLabelledLine(
        'locked',
        `${toggle.feature} is ${toggle.from ?? 'absent'} and Jira has locked it; ${toggle.to} cannot be set here`,
      ),
    );
  }
  for (const status of plan.unmanaged) {
    lines.push(formatLabelledLine('unmanaged', `status '${status.name}' is not in the spec and will not be touched`));
  }
  if (options.seedBacklog !== undefined) {
    lines.push(formatLabelledLine('seed', `move every '${options.seedBacklog}' work item off the board`));
  }

  // The seed is a write that the run will make, so a plan with one is never reported as holding nothing to do.
  if (countChanges(plan) === 0 && options.seedBacklog === undefined) {
    lines.push(
      plan.lockedFeatures.length === 0
        ? 'no changes: The project already matches the spec'
        : 'no changes to make: Every remaining difference is locked by Jira',
    );
  }

  return lines.join('\n');
}

/**
 * What the plan alone does not contain: the key for which it was read, and the backlog seed for which the run
 * was asked.
 */
export interface PlanRenderOptions {
  readonly projectKey: string;
  readonly seedBacklog?: string | undefined;
}

// region | Helpers

/**
 * Counts the writes that a plan contains. An unmanaged status is a report rather than a change, and a backlog seed is
 * not in the plan at all: It is asked for on the command line rather than derived from the project's state.
 */
function countChanges(plan: ReconciliationPlan): number {
  return plan.creations.length + plan.featureToggles.length + plan.statusUpdates.length + plan.transitionRenames.length;
}

/** Names whichever of a status's name and category the update changes. */
function describeStatusUpdate(update: ReconciliationPlan['statusUpdates'][number]): string {
  const parts: string[] = [];

  if (update.to !== update.from) parts.push(`'${update.from}' → '${update.to}'`);
  if (update.category !== update.fromCategory) parts.push(`${update.fromCategory} → ${update.category}`);

  return parts.join(', ');
}

// endregion | Helpers
