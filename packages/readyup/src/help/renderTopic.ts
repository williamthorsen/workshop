import path from 'node:path';

import type { OutputStyle } from '@williamthorsen/toolbelt.terminal/candidate';

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

/**
 * Renders a doc file for printing at a terminal.
 *
 * Links on prose lines become text that a reader can act on: A link to another topic names the `rdy help`
 * command that prints it, and an absolute URL is spelled out. Code spans and fenced blocks print as written.
 */
export function renderTopic(markdown: string, options: RenderTopicOptions): string {
  let fenced = false;

  return markdown
    .split('\n')
    .map((line) => {
      if (line.startsWith('```')) {
        fenced = !fenced;
        return line;
      }
      return fenced ? line : renderLinks(line, options.topicByStem);
    })
    .join('\n');
}

// region | Helpers

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

/** Renders the links on one prose line, leaving its code spans as written. */
function renderLinks(line: string, topicByStem: Readonly<Record<string, string>>): string {
  return line.replaceAll(
    CODE_OR_LINK,
    (match, _ticks: string | undefined, text: string | undefined, destination: string | undefined) =>
      text === undefined || destination === undefined ? match : renderLink(match, text, destination, topicByStem),
  );
}

// endregion | Helpers
