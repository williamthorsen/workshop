/**
 * Formats a line that continues the one above it, starting its text in the column that follows every label.
 *
 * @internal
 */
export function formatContinuationLine(text: string): string {
  return `${' '.repeat(LABEL_FIELD_WIDTH_CHARS)}${text}`;
}

/**
 * Formats a labelled line of `thor-jira` output, padding the label so that the text of every such line starts in one
 * column.
 *
 * @internal
 */
export function formatLabelledLine(label: LineLabel, text: string): string {
  return `${label.padEnd(LABEL_FIELD_WIDTH_CHARS)}${text}`;
}

/**
 * Every label that `thor-jira` output prints. The longest one sets the column in which the text of each line starts.
 *
 * @internal
 */
export const LINE_LABELS = [
  'backlog',
  'columns',
  'create',
  'feature',
  'locked',
  'project',
  'rename',
  'seed',
  'toggle',
  'unmanaged',
  'update',
  'workflow',
] as const;

// region | Helpers

const LABEL_FIELD_WIDTH_CHARS = Math.max(...LINE_LABELS.map((label) => label.length)) + 1;

type LineLabel = (typeof LINE_LABELS)[number];

// endregion | Helpers
