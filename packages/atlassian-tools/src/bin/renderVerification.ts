import type { BoardColumnReport, VerificationReport } from '@williamthorsen/toolbelt.atlassian/candidate';

import { formatContinuationLine, formatLabelledLine } from './labelled-lines.ts';

/**
 * Renders what the server stores after a run: each spec entry against the live configuration, then the board's
 * column coverage and order. A column gap is reported rather than treated as a fault, since the public API cannot
 * set a column. Composes a string and prints nothing.
 *
 * @internal
 */
export function renderVerification(report: VerificationReport, columns: BoardColumnReport): string {
  const lines = ['configuration after the run:'];

  for (const status of report.statuses) {
    lines.push(
      `  ${mark(status.matches)} ${status.name} (${status.category ?? 'absent'}), transition '${status.transition ?? 'absent'}'`,
    );
  }
  for (const feature of report.features) {
    // A locked feature that does not match is neither ok nor a fault: No call could have changed it.
    const marker = feature.locked && !feature.matches ? 'LOCK' : mark(feature.matches);
    const suffix = feature.locked && !feature.matches ? ', which Jira has locked and the API cannot set' : '';
    lines.push(`  ${marker} ${feature.feature} = ${feature.state ?? 'absent'}${suffix}`);
  }

  lines.push(formatLabelledLine('columns', columns.columns.join(' | ')));

  if (columns.uncovered.length > 0) {
    const names = columns.uncovered.map((name) => `'${name}'`).join(', ');
    lines.push(
      formatLabelledLine('columns', `${names} map to no column, so their work items appear only in search;`),
      formatContinuationLine('add a column for each in the board settings, which the public API cannot do'),
    );
  }

  if (columns.order !== undefined) {
    lines.push(
      formatLabelledLine('columns', `order differs from the spec (${columns.order.expected.join(' | ')});`),
      formatContinuationLine('reorder by dragging in the board settings'),
    );
  }

  return lines.join('\n');
}

// region | Helpers

/** Marks one line of the report, padded so that the names below it line up. */
function mark(matches: boolean): string {
  return matches ? 'ok  ' : 'MISS';
}

// endregion | Helpers
