import { describe, expect, it } from 'vitest';

import { HELP } from '../helpText.ts';
import { readReadmeSection } from '../readmeSection.ts';
import { TOPICS } from '../topics.ts';

describe('help topics', () => {
  it.each(Object.entries(TOPICS).map(([topic, { heading }]) => ({ heading, topic })))(
    'resolves $topic to its section of the shipped README',
    ({ heading }) => {
      const section = readReadmeSection(heading);
      const body = section.slice(`## ${heading}\n`.length).trim();

      expect(section.startsWith(`## ${heading}\n`)).toBe(true);
      expect(body).not.toBe('');
    },
  );

  it("lists every topic under the top-level help's Topics heading", () => {
    const [, afterHeading = ''] = HELP.split('Topics:\n', 2);
    const [topicsBlock = ''] = afterHeading.split('\n\n', 1);

    for (const [topic, { summary }] of Object.entries(TOPICS)) {
      expect(topicsBlock).toContain(topic);
      expect(topicsBlock).toContain(summary);
    }
  });
});
