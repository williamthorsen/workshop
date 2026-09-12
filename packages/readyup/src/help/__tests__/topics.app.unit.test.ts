import { describe, expect, it } from 'vitest';

import { HELP } from '../helpText.ts';
import { readDoc } from '../readDoc.ts';
import { TOPICS } from '../topics.ts';

describe('help topics', () => {
  it.each(Object.entries(TOPICS).map(([topic, { file }]) => ({ file, topic })))(
    'resolves $topic to the shipped $file',
    ({ file }) => {
      expect(readDoc(file).trim()).not.toBe('');
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
