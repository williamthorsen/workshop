import { measureWidth } from '@williamthorsen/toolbelt.terminal/candidate';
import { describe, expect, it } from 'vitest';

import { HELP } from '../helpText.ts';
import { readDoc } from '../readDoc.ts';
import { renderTopic } from '../renderTopic.ts';
import { TOPIC_NAMES_BY_STEM, TOPICS } from '../topics.ts';

/** Matches a line that holds a single word or code span, which no wrap can narrow. */
const UNBREAKABLE = /^\s*(?:[-*>]|\d+\.)?\s*(?:`[^`]*`|\S+)$/;

describe('help topics', () => {
  it.each(Object.entries(TOPICS).map(([topic, { file }]) => ({ file, topic })))(
    'resolves $topic to the shipped $file',
    ({ file }) => {
      expect(readDoc(file).trim()).not.toBe('');
    },
  );

  it.each(
    Object.entries(TOPICS).flatMap(([topic, { file }]) =>
      (['plain', 'rich'] as const).map((style) => ({ file, style, topic })),
    ),
  )('fits $topic within 80 columns under the $style style', ({ file, style }) => {
    const rendered = renderTopic(readDoc(file), { style, topicByStem: TOPIC_NAMES_BY_STEM, width: 80 });

    expect(listOverflowingLines(rendered)).toStrictEqual([]);
  });

  it("lists every topic under the top-level help's Topics heading", () => {
    const [, afterHeading = ''] = HELP.split('Topics:\n', 2);
    const [topicsBlock = ''] = afterHeading.split('\n\n', 1);
    // A summary may wrap onto continuation lines, so compare with every run of whitespace collapsed.
    const collapsed = topicsBlock.replaceAll(/\s+/gu, ' ');

    for (const [topic, { summary }] of Object.entries(TOPICS)) {
      expect(topicsBlock).toContain(topic);
      expect(collapsed).toContain(summary);
    }
  });
});

// region | Helpers

/** Returns the lines wider than 80 columns, outside fenced blocks and headings, that a wrap could have narrowed. */
function listOverflowingLines(text: string): string[] {
  let fenced = false;

  return text.split('\n').filter((line) => {
    if (line.startsWith('```')) {
      fenced = !fenced;
      return false;
    }
    return !fenced && !line.startsWith('#') && measureWidth(line) > 80 && !UNBREAKABLE.test(line);
  });
}

// endregion | Helpers
