import type { OutputStyle } from '@williamthorsen/toolbelt.terminal/candidate';

import type { ReportLine } from '../move/settle-move.ts';
import { type ApplyMovesResult, type EntryOutcome, isApplyMovesClean } from './apply-moves-result.ts';
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
 * Renders an `apply-moves` result as status lines, each top-level line led by its status glyph in the given style and
 * each detail line indented past the glyph column. A problem that a person must act on goes to stderr; an action and
 * the remaining references go to stdout.
 */
export function renderApplyMovesLines(result: ApplyMovesResult, style: OutputStyle, home: string): ReportLine[] {
  const format = buildLineFormat(style, home);
  const lines = [
    ...result.entries.flatMap((entry) => renderEntry(format, entry)),
    ...renderSettlement(format, result.settlement),
    ...renderReferenceReport(format, result.problems, result.references),
  ];
  if (isApplyMovesClean(result)) {
    lines.push(
      formatStatusLine(format, 'stdout', 'passed', 'every registered clone on this machine is at its registered path'),
    );
  } else if (result.isDryRun && result.entries.some((entry) => entry.status === 'planned')) {
    lines.push(formatStatusLine(format, 'stdout', 'info', 'nothing moved; run without --dry-run to apply the moves'));
  }
  return lines;
}

// region | Helpers
/** Renders one entry's warnings, then its outcome. */
function renderEntry(format: LineFormat, entry: EntryOutcome): ReportLine[] {
  const lines = [
    ...entry.ignoredFormerPaths.map((formerPath) =>
      formatStatusLine(
        format,
        'stderr',
        'warning',
        `${entry.entry}: ignored ${formatPath(format, formerPath)}, which is not its clone`,
      ),
    ),
    ...entry.missingWorktrees.map((worktree) =>
      formatStatusLine(
        format,
        'stderr',
        'warning',
        `${formatPath(format, worktree)} is missing; run git worktree prune to drop it`,
      ),
    ),
  ];
  const changedLines = entry.moves.map((move) =>
    formatStatusLine(format, 'stdout', 'changed', formatMoveText(format, move)),
  );
  switch (entry.status) {
    case 'blocked':
      lines.push(
        ...entry.reasons.map((reason) => formatStatusLine(format, 'stderr', 'blocked', `${entry.entry}: ${reason}`)),
      );
      break;
    case 'failed':
      lines.push(
        ...changedLines,
        ...entry.reasons.map((reason) => formatStatusLine(format, 'stderr', 'failed', `${entry.entry}: ${reason}`)),
        ...entry.notMoved.map((move) =>
          formatDetailLine(format, 'stderr', `not moved: ${formatPath(format, move.from)}`),
        ),
      );
      break;
    case 'moved':
      lines.push(...changedLines);
      break;
    case 'planned':
      lines.push(
        ...entry.moves.map((move) =>
          formatStatusLine(format, 'stdout', 'info', `would move ${formatMoveText(format, move)}`),
        ),
      );
      break;
    case 'unchanged':
      break;
  }
  return lines;
}

// endregion | Helpers
