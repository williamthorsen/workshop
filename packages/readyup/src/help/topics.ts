import path from 'node:path';

/** Returns the topic named by `subject`, which is a topic name or the stem of a topic's file. */
export function findTopic(subject: string): HelpTopic | undefined {
  const name = Object.hasOwn(TOPIC_NAMES_BY_STEM, subject) ? TOPIC_NAMES_BY_STEM[subject] : subject;
  return name !== undefined && Object.hasOwn(TOPICS, name) ? TOPICS[name] : undefined;
}

/** A conceptual topic offered by `rdy help`, and the doc file that covers it. */
export interface HelpTopic {
  /** Name of the doc file under `docs/` that the topic prints. */
  file: string;

  /** What the file covers, as the topic list renders it. */
  summary: string;
}

/**
 * Topics that `rdy help <topic>` prints, keyed by the name that selects one.
 *
 * A topic resolves to a whole file rather than a set of headings assembled here, so the boundaries
 * stay the documentation's own and a topic cannot drift from what it prints. This table is the sole
 * declaration site: The list rendered by help comes from it, and so do the file stems that a topic
 * also answers to.
 */
export const TOPICS: Readonly<Record<string, HelpTopic>> = {
  authoring: { file: 'authoring-kits.md', summary: 'Writing kits, checklists, and checks' },
  concepts: { file: 'concepts.md', summary: 'Kits, severities, statuses, and thresholds' },
  json: { file: 'json-output.md', summary: 'The JSON report and its schemas' },
  publishing: { file: 'publishing-kits.md', summary: 'Compiling, packaging, and verifying kits' },
  running: { file: 'running-checks.md', summary: 'Selecting what runs, reading the output, and suppressing a finding' },
  utils: { file: 'check-utils.md', summary: 'Helpers that a kit imports from readyup' },
};

/**
 * Topic names keyed by the stem of the file that each one prints.
 *
 * A stem is accepted wherever a topic name is, so a file name copied from a doc's source still resolves.
 */
export const TOPIC_NAMES_BY_STEM: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(TOPICS).map(([name, { file }]) => [path.posix.basename(file, '.md'), name]),
);
