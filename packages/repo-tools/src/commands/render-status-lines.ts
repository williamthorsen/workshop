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
import type { Reference } from '../references/find-references.ts';
import { formatReference } from './move-report.ts';

/** Builds the format of the status lines in a style, with the home directory that paths are shown against. */
export function buildLineFormat(style: OutputStyle, home: string): LineFormat {
  const glyphs = STATUS_GLYPHS[style];
  return { column: measureGlyphColumn(glyphs), glyphs, home };
}

/** Formats a detail line, indented two cells past the start of the text of a status line. */
export function formatDetailLine(format: LineFormat, stream: ReportLine['stream'], text: string): ReportLine {
  return { stream, text: `${' '.repeat(format.column + 3)}${text}` };
}

/** Formats a move as `<from> -> <to>`, each path in its `~` form. */
export function formatMoveText(format: LineFormat, move: Move): string {
  return `${formatPath(format, move.from)} -> ${formatPath(format, move.to)}`;
}

/** Formats a path in its `~` form. */
export function formatPath(format: LineFormat, target: string): string {
  return formatDisplayPath(target, format.home);
}

/** Formats a line led by a status glyph padded to the glyph column. */
export function formatStatusLine(
  format: LineFormat,
  stream: ReportLine['stream'],
  name: StatusGlyphName,
  text: string,
): ReportLine {
  const glyph = format.glyphs[name];
  return { stream, text: `${glyph.text}${' '.repeat(format.column - glyph.width)} ${text}` };
}

/** The style in which lines are rendered: the glyphs, the width of their column, and the home directory for `~`. */
export interface LineFormat {
  column: number;
  glyphs: Readonly<Record<StatusGlyphName, Glyph>>;
  home: string;
}

/**
 * Renders the reference search: a warning per clone or path that it could not read, on stderr, then the count of the
 * remaining references and a detail line per reference, on stdout.
 */
export function renderReferenceReport(
  format: LineFormat,
  problems: readonly string[],
  references: readonly Reference[],
): ReportLine[] {
  const lines = problems.map((problem) => formatStatusLine(format, 'stderr', 'warning', problem));
  const count = references.length;
  if (count > 0) {
    const noun = count === 1 ? 'reference' : 'references';
    lines.push(formatStatusLine(format, 'stdout', 'warning', `${count} remaining ${noun} to the old paths`));
    for (const reference of references) lines.push(formatDetailLine(format, 'stdout', formatReference(reference)));
  }
  return lines;
}

/** Renders each settlement event as a status line on the stream to which its text belongs. */
export function renderSettlement(format: LineFormat, events: readonly SettleEvent[]): ReportLine[] {
  return events.map((event) => {
    const { stream, text } = formatSettleEvent(event, format.home);
    return formatStatusLine(format, stream, selectSettleStatus(event), text);
  });
}

// region | Helpers
/** Returns the status of a settlement event: `changed` for a completed action, `info` for a planned one. */
function selectSettleStatus(event: SettleEvent): StatusGlyphName {
  if (event.status === 'done') return 'changed';
  if (event.status === 'planned') return 'info';
  return 'warning';
}
// endregion | Helpers
