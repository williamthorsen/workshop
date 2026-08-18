/**
 * README sections `rdy help <topic>` prints, keyed by the topic name that selects one.
 *
 * A topic resolves to a whole section rather than a set of headings assembled here, so the section
 * boundaries stay the README's own and a topic cannot drift from the document it prints.
 */
export const TOPIC_HEADINGS: Readonly<Record<string, string>> = {
  authoring: 'Authoring kits',
  concepts: 'Concepts',
  json: 'JSON output',
  publishing: 'Publishing kits',
  utils: 'Check utilities',
};

/** Topic names, in the order help output lists them. */
export const TOPIC_NAMES: readonly string[] = Object.keys(TOPIC_HEADINGS);
