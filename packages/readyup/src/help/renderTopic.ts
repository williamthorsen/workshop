import path from 'node:path';

import type { OutputStyle } from '@williamthorsen/toolbelt.terminal/candidate';

import { PLAIN_BY_RICH_GLYPH } from '../layout/formatter.ts';

/** What `renderTopic` needs to know beyond the Markdown itself. */
export interface RenderTopicOptions {
  /** Style under which the topic prints. */
  style: OutputStyle;

  /** Topic names keyed by the stem of the doc file that each one prints. */
  topicByStem: Readonly<Record<string, string>>;
}

/**
 * Matches an inline code span or a link, whichever starts first.
 *
 * A link's text may contain a code span, so the link alternative consumes spans whole; a span that does
 * not open inside link text is matched by the first alternative and left as written.
 */
const CODE_OR_LINK = /(`+)[^`]*?\1|\[((?:`[^`]*`|[^\]`])*)\]\(([^)\s]+)\)/g;

/** Matches one emoji, with the variation selector and the space that may follow it. */
const EMOJI = /(\p{Extended_Pictographic})\u{FE0F}?( ?)/gu;

/** Header of the table column that shows rich glyphs, which has nothing to show under the plain style. */
const RICH_COLUMN = 'Rich';

/** Matches the separator row beneath a table's header. */
const TABLE_SEPARATOR = /^\|(?: *:?-+:? *\|)+ *$/;

/** Matches a cell boundary: a pipe that a backslash does not escape. */
const CELL_BOUNDARY = /(?<!\\)\|/;

/**
 * Renders a doc file for printing at a terminal.
 *
 * Links on prose lines become text that a reader can act on: A link to another topic names the `rdy help`
 * command that prints it, and an absolute URL is spelled out. Code spans and fenced blocks print as written.
 *
 * Under the plain style, every emoji gives way to the word that plain output prints in its place, or to
 * nothing, so a sample of rich output reads as plain output. A table column of rich glyphs is omitted, and
 * so is a table left with one column.
 */
export function renderTopic(markdown: string, options: RenderTopicOptions): string {
  let fenced = false;

  const lines = markdown.split('\n').map((line) => {
    if (line.startsWith('```')) {
      fenced = !fenced;
      return line;
    }
    return fenced ? line : renderLinks(line, options.topicByStem);
  });

  return options.style === 'plain' ? dropRichColumns(lines).map(replaceEmoji).join('\n') : lines.join('\n');
}

// region | Helpers

/**
 * Returns `lines` without the `Rich` column of any table, and without a table that the drop leaves with one column.
 *
 * A table is a run of lines starting with `|` whose second line is a separator row, outside a fenced block.
 */
function dropRichColumns(lines: string[]): string[] {
  const kept: string[] = [];
  let fenced = false;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (line.startsWith('```')) fenced = !fenced;

    if (fenced || !line.startsWith('|') || !TABLE_SEPARATOR.test(lines[index + 1] ?? '')) {
      kept.push(line);
      index += 1;
      continue;
    }

    let end = index;
    while (lines[end]?.startsWith('|') === true) end += 1;
    const rows = lines.slice(index, end).map(splitCells);
    const column = rows[0]?.findIndex((cell) => cell.trim() === RICH_COLUMN) ?? -1;

    if (column === -1) {
      kept.push(...lines.slice(index, end));
    } else if ((rows[0]?.length ?? 0) > 2) {
      kept.push(...rows.map((cells) => `|${cells.filter((_cell, at) => at !== column).join('|')}|`));
    } else if (lines[end] === '') {
      // Take the blank line after the omitted table too, so that the text around it keeps one blank line between.
      end += 1;
    }
    index = end;
  }

  return kept;
}

/** Whether a link destination is absolute, naming a scheme or a host. */
function isAbsoluteDestination(destination: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(destination) || destination.startsWith('//');
}

/** Renders one link as text, or returns it as written when it names a file that is not a topic. */
function renderLink(written: string, text: string, destination: string, topicByStem: Record<string, string>): string {
  if (destination.startsWith('#')) return text;
  if (isAbsoluteDestination(destination)) return text === destination ? destination : `${text} (${destination})`;

  const [file = ''] = destination.split('#', 1);
  const stem = path.posix.basename(file, '.md');
  const topic = Object.hasOwn(topicByStem, stem) ? topicByStem[stem] : undefined;

  return topic === undefined ? written : `${text} (rdy help ${topic})`;
}

/** Replaces each emoji with what plain output prints in its place, taking a following space when that is nothing. */
function replaceEmoji(line: string): string {
  return line.replaceAll(EMOJI, (_match, glyph: string, space: string) => {
    const plain = PLAIN_BY_RICH_GLYPH.get(glyph) ?? '';
    return plain === '' ? '' : `${plain}${space}`;
  });
}

/** Renders the links on one prose line, leaving its code spans as written. */
function renderLinks(line: string, topicByStem: Readonly<Record<string, string>>): string {
  return line.replaceAll(
    CODE_OR_LINK,
    (match, _ticks: string | undefined, text: string | undefined, destination: string | undefined) =>
      text === undefined || destination === undefined ? match : renderLink(match, text, destination, topicByStem),
  );
}

/** Splits a table row into its cells, without the empty strings outside its outer pipes. */
function splitCells(row: string): string[] {
  return row.trim().split(CELL_BOUNDARY).slice(1, -1);
}

// endregion | Helpers
