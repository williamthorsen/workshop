import { describe, expect, it } from 'vitest';

import { renderTopic } from '../renderTopic.ts';

const topicByStem = { 'authoring-kits': 'authoring', 'publishing-kits': 'publishing' };

describe(renderTopic, () => {
  it.each([
    {
      label: 'a link to another topic',
      input: 'See [Config](authoring-kits.md#config) first.',
      expected: 'See Config (rdy help authoring) first.',
    },
    {
      label: 'a link to another topic without an anchor',
      input: 'See [publishing](./publishing-kits.md).',
      expected: 'See publishing (rdy help publishing).',
    },
    {
      label: 'a same-topic anchor',
      input: 'See [advisory warnings](#advisory-warnings).',
      expected: 'See advisory warnings.',
    },
    {
      label: 'an absolute URL',
      input: 'Read [the spec](https://example.com/spec).',
      expected: 'Read the spec (https://example.com/spec).',
    },
    {
      label: 'an absolute URL whose text is the URL',
      input: 'Read [https://example.com](https://example.com).',
      expected: 'Read https://example.com.',
    },
    {
      label: 'a link whose text contains a code span',
      input: 'Its [`rebuildCompiledWith`](publishing-kits.md#verifying-by-recompiling) field.',
      expected: 'Its `rebuildCompiledWith` (rdy help publishing) field.',
    },
    {
      label: 'two links on one line',
      input: '[a](#x) and [b](authoring-kits.md)',
      expected: 'a and b (rdy help authoring)',
    },
  ])('renders $label', ({ input, expected }) => {
    expect(renderTopic(input, { style: 'rich', topicByStem, width: Infinity })).toBe(expected);
  });

  it('leaves a link to a file that is not a topic as written', () => {
    const line = 'See [the README](../README.md).';

    expect(renderTopic(line, { style: 'rich', topicByStem, width: Infinity })).toBe(line);
  });

  it('leaves a link inside a code span as written', () => {
    const line = 'Write `[Config](authoring-kits.md#config)` to link it.';

    expect(renderTopic(line, { style: 'rich', topicByStem, width: Infinity })).toBe(line);
  });

  it('leaves a link inside a fenced block as written', () => {
    const markdown = ['```', '[Config](authoring-kits.md#config)', '```', '[Config](authoring-kits.md#config)'].join(
      '\n',
    );

    expect(renderTopic(markdown, { style: 'rich', topicByStem, width: Infinity }).split('\n')).toStrictEqual([
      '```',
      '[Config](authoring-kits.md#config)',
      '```',
      'Config (rdy help authoring)',
    ]);
  });

  it('replaces each emoji with its plain word under the plain style, inside code too', () => {
    const markdown = ['A `❌ Node >= 24` claim.', '```', '✅ deploy.ts -> 📓 deploy.js', '⚪ smoke.ts', '```'].join(
      '\n',
    );

    expect(renderTopic(markdown, { style: 'plain', topicByStem, width: Infinity }).split('\n')).toStrictEqual([
      'A `FAIL Node >= 24` claim.',
      '```',
      'PASS deploy.ts -> deploy.js',
      'SKIP smoke.ts',
      '```',
    ]);
  });

  it('removes an emoji outside the vocabulary under the plain style', () => {
    expect(renderTopic('🎉 Done 💡 Hint: rerun', { style: 'plain', topicByStem, width: Infinity })).toBe(
      'Done Hint: rerun',
    );
  });

  it('leaves emoji in place under the rich style', () => {
    const line = '✅ deploy.ts -> 📓 deploy.js';

    expect(renderTopic(line, { style: 'rich', topicByStem, width: Infinity })).toBe(line);
  });

  it('drops the Rich column of a table under the plain style', () => {
    const markdown = ['| Rich | Plain | Status |', '| ---- | ----- | ------ |', '| ✅ | `PASS` | `a \\| b` |'].join(
      '\n',
    );

    expect(renderTopic(markdown, { style: 'plain', topicByStem, width: Infinity }).split('\n')).toStrictEqual([
      '| Plain | Status |',
      '| ----- | ------ |',
      '| `PASS` | `a \\| b` |',
    ]);
  });

  it('omits a table that dropping its Rich column leaves with one column, with the blank line after it', () => {
    const markdown = ['Before.', '', '| Rich | Names |', '| ---- | ----- |', '| 📓 | a kit |', '', 'After.'].join('\n');

    expect(renderTopic(markdown, { style: 'plain', topicByStem, width: Infinity }).split('\n')).toStrictEqual([
      'Before.',
      '',
      'After.',
    ]);
  });

  it('measures a table for fitting after the plain style drops its Rich column', () => {
    // The table measures 26 columns with its Rich column and 21 without it.
    const markdown = ['| Rich | Plain | Status |', '| ---- | ----- | ------ |', '| ✅ | `PASS` | `a \\| b` |'].join(
      '\n',
    );

    expect(renderTopic(markdown, { style: 'plain', topicByStem, width: 22 }).split('\n')).toStrictEqual([
      '| Plain | Status |',
      '| ----- | ------ |',
      '| `PASS` | `a \\| b` |',
    ]);
    expect(renderTopic(markdown, { style: 'rich', topicByStem, width: 22 }).split('\n', 1)[0]).toBe('- ✅');
  });

  it('keeps a table inside a fenced block under the plain style', () => {
    const markdown = ['```', '| Rich | Names |', '| ---- | ----- |', '```'].join('\n');

    expect(renderTopic(markdown, { style: 'plain', topicByStem, width: Infinity })).toBe(markdown);
  });
});
