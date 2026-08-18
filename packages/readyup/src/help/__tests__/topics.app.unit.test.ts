import { describe, expect, it } from 'vitest';

import { readReadmeSection } from '../readmeSection.ts';
import { TOPIC_HEADINGS } from '../topics.ts';

describe('help topics', () => {
  it.each(Object.entries(TOPIC_HEADINGS).map(([topic, heading]) => ({ heading, topic })))(
    'resolves $topic to its section of the shipped README',
    ({ heading }) => {
      const section = readReadmeSection(heading);
      const body = section.slice(`## ${heading}\n`.length).trim();

      expect(section.startsWith(`## ${heading}\n`)).toBe(true);
      expect(body).not.toBe('');
    },
  );
});
