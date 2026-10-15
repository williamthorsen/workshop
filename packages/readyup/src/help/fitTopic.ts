import { measureWidth, wrapToWidth, type WrapToWidthOptions } from '@williamthorsen/toolbelt.terminal/candidate';

import { HELP_WIDTH } from './helpText.ts';
import { findTableEnd, isTableStart, splitCells } from './table-syntax.ts';

/** Matches an inline code span. */
const CODE_SPAN = /(`+)[^`]*?\1/g;

/**
 * Stands in for a space inside a code span while a line wraps, so that the span stays whole.
 *
 * A private-use character: `wrapToWidth` collapses every `\s` match, NBSP among them, and breaks only at U+0020.
 * The character measures one column, as the space that it replaces does.
 */
const SPAN_SPACE = '\u{E000}';

/** Matches the marker of a list item, with the space after it. */
const LIST_MARKER = /^\s*(?:[-*]|\d+\.) /;

/** Matches the marker of a blockquote line, with the space that may follow it. */
const QUOTE_MARKER = /^> ?/;

/** Indent of a cell beneath its row's lead in a table rendered as a list. */
const LIST_INDENT = 2;

/**
 * Lays out a rendered topic to `width`, `Infinity` meaning no limit.
 *
 * Prose wraps at word boundaries within `width`, capped at the help width, and keeps a list item's hanging
 * indent and a blockquote's marker; a code span is never split. A table prints as written when every row fits
 * `width`, and as a list otherwise, one item per row. Headings and fenced blocks print as written.
 */
export function fitTopic(text: string, width: number): string {
  if (width === Infinity) return text;

  const proseWidth = Math.min(width, HELP_WIDTH);
  const lines = text.split('\n');
  const fitted: string[] = [];
  let fenced = false;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (line.startsWith('```')) fenced = !fenced;

    if (fenced || line.startsWith('```')) {
      fitted.push(line);
      index += 1;
    } else if (isTableStart(lines, index)) {
      const end = findTableEnd(lines, index);
      fitted.push(...fitTable(lines.slice(index, end), width, proseWidth));
      index = end;
    } else {
      fitted.push(fitLine(line, proseWidth));
      index += 1;
    }
  }

  return fitted.join('\n');
}

// region | Helpers

/** Wraps one prose line: a blockquote, a list item, or a paragraph. Blank lines and headings print as written. */
function fitLine(line: string, width: number): string {
  if (line.trim() === '' || line.startsWith('#')) return line;

  const quote = QUOTE_MARKER.exec(line);
  if (quote !== null) {
    const content = wrapProse(line.slice(quote[0].length), { width: width - 2 });
    return content === '' ? line : content.replaceAll(/^/gm, '> ');
  }

  const marker = LIST_MARKER.exec(line)?.[0];
  if (marker !== undefined) {
    return `${marker}${wrapProse(line.slice(marker.length), { width, indent: marker.length, hanging: true })}`;
  }

  return wrapProse(line, { width });
}

/** Returns a table's rows as written when they fit `width`, and otherwise the table as a list wrapped to `proseWidth`. */
function fitTable(rows: string[], width: number, proseWidth: number): string[] {
  if (rows.every((row) => measureWidth(row) <= width)) return rows;

  const [headerRow = '', , ...bodyRows] = rows;
  const headers = splitCells(headerRow).map((cell) => cell.trim());
  const labelled = headers.length > 2;

  return bodyRows.flatMap((row) => {
    const [lead = '', ...rest] = splitCells(row).map((cell) => cell.trim());
    const cells = rest
      .map((cell, at) => (labelled ? `${headers[at + 1] ?? ''}: ${cell}` : cell))
      .map((cell) => wrapProse(cell, { width: proseWidth, indent: LIST_INDENT }))
      .filter((cell) => cell !== '');
    return [`- ${wrapProse(lead, { width: proseWidth, indent: LIST_INDENT, hanging: true })}`, ...cells];
  });
}

/** Wraps `text` as `wrapToWidth` does, keeping each code span whole on one line. */
function wrapProse(text: string, options: WrapToWidthOptions): string {
  const guarded = text.replaceAll(CODE_SPAN, (span) => span.split(' ').join(SPAN_SPACE));
  return wrapToWidth(guarded, options).replaceAll(SPAN_SPACE, ' ');
}

// endregion | Helpers
