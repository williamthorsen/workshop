import {
  type Glyph,
  measureGlyphColumn,
  type OutputStyle,
  STATUS_GLYPHS,
  type StatusGlyphName,
} from '@williamthorsen/toolbelt.terminal/candidate';

import type { Move } from '../move/move-plan.ts';
import { formatSettleEvent, type ReportLine, type SettleEvent } from '../move/settle-move.ts';
import { formatDisplayPath } from '../portable/paths.ts';
import { type ApplyMovesResult, type EntryOutcome, isApplyMovesClean } from './apply-moves-result.ts';
import { formatReference } from './move-report.ts';

/**
 * Renders an `apply-moves` result as status lines, each top-level line led by its status glyph in the given style and
 * each detail line indented past the glyph column. A problem that a person must act on goes to stderr; an action and
 * the remaining references go to stdout.
 */
export function renderApplyMovesLines(result: ApplyMovesResult, style: OutputStyle, home: string): ReportLine[] {
  const glyphs = STATUS_GLYPHS[style];
  const format: LineFormat = { column: measureGlyphColumn(glyphs), glyphs, home };

  const lines = result.entries.flatMap((entry) => renderEntry(format, entry));
  for (const event of result.settlement) {
    const { stream, text } = formatSettleEvent(event, home);
    lines.push(formatStatusLine(format, stream, selectSettleStatus(event), text));
  }
  for (const problem of result.problems) lines.push(formatStatusLine(format, 'stderr', 'warning', problem));
  const count = result.references.length;
  if (count > 0) {
    const noun = count === 1 ? 'reference' : 'references';
    lines.push(formatStatusLine(format, 'stdout', 'warning', `${count} remaining ${noun} to the old paths`));
    for (const reference of result.references) {
      lines.push(formatDetailLine(format, 'stdout', formatReference(reference)));
    }
  }
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
/** The style in which lines are rendered: the glyphs, the width of their column, and the home directory for `~`. */
interface LineFormat {
  column: number;
  glyphs: Readonly<Record<StatusGlyphName, Glyph>>;
  home: string;
}

/** Formats a detail line, indented two cells past the start of the text of a status line. */
function formatDetailLine(format: LineFormat, stream: ReportLine['stream'], text: string): ReportLine {
  return { stream, text: `${' '.repeat(format.column + 3)}${text}` };
}

/** Formats a move as `<from> -> <to>`, each path in its `~` form. */
function formatMoveText(format: LineFormat, move: Move): string {
  return `${formatPath(format, move.from)} -> ${formatPath(format, move.to)}`;
}

/** Formats a path in its `~` form. */
function formatPath(format: LineFormat, target: string): string {
  return formatDisplayPath(target, format.home);
}

/** Formats a line led by a status glyph padded to the glyph column. */
function formatStatusLine(
  format: LineFormat,
  stream: ReportLine['stream'],
  name: StatusGlyphName,
  text: string,
): ReportLine {
  const glyph = format.glyphs[name];
  return { stream, text: `${glyph.text}${' '.repeat(format.column - glyph.width)} ${text}` };
}

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

/** Returns the status of a settlement event: `changed` for a completed action, `info` for a planned one. */
function selectSettleStatus(event: SettleEvent): StatusGlyphName {
  if (event.status === 'done') return 'changed';
  if (event.status === 'planned') return 'info';
  return 'warning';
}
// endregion | Helpers
