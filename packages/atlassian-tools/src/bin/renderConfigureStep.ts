import { formatContinuationLine, formatLabelledLine } from './labelled-lines.ts';
import type { ConfigureStep } from './reconcileProject.ts';
import { renderPlan } from './renderPlan.ts';
import { renderVerification } from './renderVerification.ts';

/**
 * What `POST /rest/agile/1.0/board/{boardId}/issue` accepts in one call, which bounds the undo that the
 * seed prints.
 */
const BOARD_MOVE_LIMIT = 50;

/**
 * Renders one step of a reconciliation as the text that `configure-project` prints for it, each line ending in a
 * newline, or as an empty string for a step that prints nothing. Composes a string and prints nothing.
 *
 * @internal
 */
export function renderConfigureStep(step: ConfigureStep): string {
  return composeLines(selectLines(step));
}

// region | Helpers

/** Joins lines into printed text, ending each with a newline. */
function composeLines(lines: readonly string[]): string {
  return lines.map((line) => `${line}\n`).join('');
}

/** Selects the lines that one step prints. */
function selectLines(step: ConfigureStep): string[] {
  switch (step.kind) {
    case 'backlog':
      if (step.found === 0) return [formatLabelledLine('backlog', `no '${step.status}' work items to move`)];

      // The run prints no keys, and a move leaves an item's status alone, so the query still selects the same set.
      return [
        formatLabelledLine('backlog', `moved ${step.moved} '${step.status}' work items off the board`),
        formatContinuationLine(
          `undo: POST /rest/agile/1.0/board/${step.boardId}/issue, ${BOARD_MOVE_LIMIT} keys per call`,
        ),
        formatContinuationLine(`keys: ${step.jql}`),
      ];
    case 'dry-run':
      return ['', 'dry run: Nothing was written'];
    case 'features':
      return step.toggles.map((toggle) => formatLabelledLine('feature', `${toggle.feature} → ${toggle.to}`));
    case 'plan':
      return [
        renderPlan(step.plan, step.configuration, { projectKey: step.projectKey, seedBacklog: step.seedBacklog }),
      ];
    case 'verification':
      return ['', renderVerification(step.report, step.columns)];
    case 'workflow':
      return selectWorkflowLines(step);
  }
}

/** Selects the lines that report the workflow write and any status that the status API amended after it. */
function selectWorkflowLines(step: Extract<ConfigureStep, { kind: 'workflow' }>): string[] {
  const outcome = step.written ? `updated: ${step.amended} amended, ${step.created} created` : 'unchanged';
  const lines = [formatLabelledLine('workflow', outcome)];

  if (step.correctedStatuses.length > 0) {
    const corrections = step.correctedStatuses.map((status) => `${status.from} → ${status.to}`).join(', ');
    lines.push(`amended via the status API: ${corrections}`);
  }

  return lines;
}

// endregion | Helpers
