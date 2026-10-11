import type { IssueSummary } from '@williamthorsen/toolbelt.atlassian/candidate';

/**
 * Renders one line per work item, padding the key and status columns to their widest value. An empty listing
 * renders as an empty string.
 *
 * @internal
 */
export function renderIssueList(summaries: readonly IssueSummary[]): string {
  const keyWidth = Math.max(0, ...summaries.map(({ key }) => key.length));
  const statusWidth = Math.max(0, ...summaries.map(({ status }) => status.length));

  return summaries
    .map(({ key, status, summary }) =>
      `${key.padEnd(keyWidth)}  ${status.padEnd(statusWidth)}  ${collapseLineBreaks(summary)}`.trimEnd(),
    )
    .join('\n');
}

// region | Helpers

/** Joins the lines of a summary with single spaces, so that each work item stays on one line. */
function collapseLineBreaks(text: string): string {
  return text.replaceAll(/\s*[\r\n]+\s*/g, ' ');
}

// endregion | Helpers
