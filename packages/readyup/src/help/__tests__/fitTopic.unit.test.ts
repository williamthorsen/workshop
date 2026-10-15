import { describe, expect, it } from 'vitest';

import { fitTopic } from '../fitTopic.ts';

describe(fitTopic, () => {
  it('returns the text unchanged at no limit', () => {
    const text = `${'word '.repeat(40)}\n\n| a | ${'b'.repeat(200)} |\n| - | - |\n| c | d |`;

    expect(fitTopic(text, Infinity)).toBe(text);
  });

  it('wraps a paragraph at word boundaries', () => {
    expect(fitTopic('one two three four five six', 14).split('\n')).toStrictEqual(['one two three', 'four five six']);
  });

  it('caps prose at 80 columns on a wider terminal', () => {
    const lines = fitTopic('word '.repeat(40).trim(), 200).split('\n');

    expect(lines.length).toBeGreaterThan(1);
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(80);
  });

  it('keeps the hanging indent of a bulleted item', () => {
    expect(fitTopic('- one two three four five six', 16).split('\n')).toStrictEqual([
      '- one two three',
      '  four five six',
    ]);
  });

  it('keeps the hanging indent of a numbered item, whatever the width of its number', () => {
    expect(fitTopic('10. one two three four five', 16).split('\n')).toStrictEqual([
      '10. one two',
      '    three four',
      '    five',
    ]);
  });

  it('repeats the marker of a blockquote on every line', () => {
    expect(fitTopic('> one two three four five six', 16).split('\n')).toStrictEqual([
      '> one two three',
      '> four five six',
    ]);
  });

  it('keeps a code span whole on one line', () => {
    expect(fitTopic('Run `rdy run --sources` now', 16).split('\n')).toStrictEqual([
      'Run',
      '`rdy run --sources`',
      'now',
    ]);
  });

  it('prints headings, blank lines, and fenced blocks as written', () => {
    const fence = ['```', 'x '.repeat(30), '| a | b |', '|---|---|', '```'];
    const text = ['# A heading wider than the width', '', ...fence].join('\n');

    expect(fitTopic(text, 10)).toBe(text);
  });

  it('prints a table that fits as written', () => {
    const table = ['| a   | b   |', '| --- | --- |', '| c   | d   |'].join('\n');

    expect(fitTopic(table, 13)).toBe(table);
  });

  it('prints a table wider than 80 columns as written when it fits a wider terminal', () => {
    const table = [`| a | ${'b'.repeat(90)} |`, '| - | - |', '| c | d |'].join('\n');

    expect(fitTopic(table, 120)).toBe(table);
  });

  it('measures emoji as two columns when deciding whether a table fits', () => {
    // Each emoji row is 10 code units long and 11 columns wide.
    const table = ['| ✅ | ok |', '| - | - |', '| ❌ | no |'].join('\n');

    expect(fitTopic(table, 10)).not.toBe(table);
    expect(fitTopic(table, 11)).toBe(table);
  });

  it('renders a two-column table that does not fit as a list of rows', () => {
    const table = [
      '| Field  | Meaning                      |',
      '| ------ | ---------------------------- |',
      '| `name` | The name of the kit as given |',
      '| `path` | The bundle                   |',
    ].join('\n');

    expect(fitTopic(table, 20).split('\n')).toStrictEqual([
      '- `name`',
      '  The name of the',
      '  kit as given',
      '- `path`',
      '  The bundle',
    ]);
  });

  it('labels each cell with its header when the table has more than two columns', () => {
    const table = ['| Code | Severity | Raised when   |', '| - | - | - |', '| `x`  | `warn`   | A file is old |'].join(
      '\n',
    );

    expect(fitTopic(table, 30).split('\n')).toStrictEqual([
      '- `x`',
      '  Severity: `warn`',
      '  Raised when: A file is old',
    ]);
  });

  it('unescapes the pipes in the cells of a table rendered as a list', () => {
    const table = [
      '| Field | Type \\| kind | Meaning |',
      '| - | - | - |',
      '| `a \\| b` | `A \\| B` | Either one |',
    ].join('\n');

    expect(fitTopic(table, 30).split('\n')).toStrictEqual([
      '- `a | b`',
      '  Type | kind: `A | B`',
      '  Meaning: Either one',
    ]);
  });

  it('keeps the blank line after a table rendered as a list', () => {
    const text = ['| a | bbbbbbbbbbbbbbbbbbbb |', '| - | - |', '| c | d |', '', 'After.'].join('\n');

    expect(fitTopic(text, 20).split('\n')).toStrictEqual(['- c', '  d', '', 'After.']);
  });
});
