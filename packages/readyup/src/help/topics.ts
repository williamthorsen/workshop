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
 * declaration site: The list rendered by help comes from it, so the topics offered and the topics
 * accepted are the same set by construction.
 */
export const TOPICS: Readonly<Record<string, HelpTopic>> = {
  authoring: { file: 'authoring-kits.md', summary: 'Writing kits, checklists, and checks' },
  concepts: { file: 'concepts.md', summary: 'Kits, severities, statuses, and thresholds' },
  json: { file: 'json-output.md', summary: 'The JSON report and its schemas' },
  publishing: { file: 'publishing-kits.md', summary: 'Compiling, packaging, and verifying kits' },
  utils: { file: 'check-utils.md', summary: 'Helpers that a kit imports from readyup' },
};
