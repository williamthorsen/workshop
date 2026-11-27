import type { OutputStyle } from '@williamthorsen/toolbelt.terminal/candidate';

import type { ReportLine } from '../move/settle-move.ts';
import type { MoveResult } from './move-result.ts';
import {
  buildLineFormat,
  formatDetailLine,
  formatMoveText,
  formatPath,
  formatStatusLine,
  type LineFormat,
  renderReferenceReport,
  renderSettlement,
} from './render-status-lines.ts';

/**
 * Renders a `move` result as status lines, each top-level line led by its status glyph in the given style and each
 * detail line indented past the glyph column. A problem that a person must act on goes to stderr; an action and the
 * remaining references go to stdout.
 */
export function renderMoveLines(result: MoveResult, style: OutputStyle, home: string): ReportLine[] {
  const format = buildLineFormat(style, home);
  const lines = [
    ...result.missingWorktrees.map((worktree) =>
      formatStatusLine(
        format,
        'stderr',
        'warning',
        `${formatPath(format, worktree)} is missing; run git worktree prune to drop it`,
      ),
    ),
    ...renderOutcome(format, result),
    ...renderSettlement(format, result.settlement),
    ...renderRegistryWrite(format, result),
    ...renderReferenceReport(format, result.problems, result.references),
  ];
  if (result.status === 'planned') {
    lines.push(
      formatStatusLine(format, 'stdout', 'info', `nothing moved; run without --dry-run to move ${result.entry}`),
    );
  }
  return lines;
}

// region | Helpers
/** Renders the renames and, for a blocked or failed move, its reasons and the renames that it left unattempted. */
function renderOutcome(format: LineFormat, result: MoveResult): ReportLine[] {
  switch (result.status) {
    case 'blocked':
      return result.reasons.map((reason) => formatStatusLine(format, 'stderr', 'blocked', reason));
    case 'failed':
      return [
        ...result.moves.map((move) => formatStatusLine(format, 'stdout', 'changed', formatMoveText(format, move))),
        ...result.reasons.map((reason) => formatStatusLine(format, 'stderr', 'failed', reason)),
        ...result.notMoved.map((move) =>
          formatDetailLine(format, 'stderr', `not moved: ${formatPath(format, move.from)}`),
        ),
      ];
    case 'moved':
      return result.moves.map((move) => formatStatusLine(format, 'stdout', 'changed', formatMoveText(format, move)));
    case 'planned':
      return result.moves.map((move) =>
        formatStatusLine(format, 'stdout', 'info', `would move ${formatMoveText(format, move)}`),
      );
  }
}

/** Renders the registry write: the recorded path, the planned one, or the failure with the edit to make by hand. */
function renderRegistryWrite(format: LineFormat, result: MoveResult): ReportLine[] {
  const write = result.registry;
  if (write.status === 'skipped') return [];
  const file = formatPath(format, write.file);
  const recorded = `${write.path} as the path of ${result.entry} in ${file}`;
  switch (write.status) {
    case 'failed':
      return [
        formatStatusLine(format, 'stderr', 'failed', `cannot write ${file}: ${write.reason}`),
        formatDetailLine(
          format,
          'stderr',
          `set the path of ${result.entry} to ${write.path} and add ${write.formerPath} to its formerPaths by hand`,
        ),
      ];
    case 'planned':
      return [formatStatusLine(format, 'stdout', 'info', `would record ${recorded}`)];
    case 'written':
      return [formatStatusLine(format, 'stdout', 'changed', `recorded ${recorded}`)];
  }
}
// endregion | Helpers
