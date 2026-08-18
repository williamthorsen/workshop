/** A conceptual topic `rdy help` offers, and the README section that answers it. */
export interface HelpTopic {
  /** Level-2 README heading whose section the topic prints. */
  heading: string;

  /** What the section covers, as the topic list renders it. */
  summary: string;
}

/**
 * Topics `rdy help <topic>` prints, keyed by the name that selects one.
 *
 * A topic resolves to a whole section rather than a set of headings assembled here, so the section
 * boundaries stay the README's own and a topic cannot drift from the document it prints. This table
 * is the sole declaration site: the list help renders comes from it, so the topics offered and the
 * topics accepted are the same set by construction.
 */
export const TOPICS: Readonly<Record<string, HelpTopic>> = {
  authoring: { heading: 'Authoring kits', summary: 'Writing kits, checklists, and checks' },
  concepts: { heading: 'Concepts', summary: 'Kits, severities, statuses, and thresholds' },
  json: { heading: 'JSON output', summary: 'The JSON report and its schemas' },
  publishing: { heading: 'Publishing kits', summary: 'Compiling, packaging, and verifying kits' },
  utils: { heading: 'Check utilities', summary: 'Helpers a kit imports from readyup' },
};
