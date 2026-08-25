import { describe, expect, it } from 'vitest';

import { extractSection } from '../readmeSection.ts';

const MARKDOWN = [
  '# Title',
  '',
  'Intro.',
  '',
  '## First',
  '',
  'First body.',
  '',
  '### Nested',
  '',
  'Nested body.',
  '',
  '```bash',
  '## Second',
  '```',
  '',
  '## Second',
  '',
  'Second body.',
  '',
  '',
  '## Third',
  '',
  'Third body.',
  '',
].join('\n');

describe(extractSection, () => {
  it('returns the section from its heading to the line before the next level-2 heading', () => {
    expect(extractSection(MARKDOWN, 'First')).toBe(
      ['## First', '', 'First body.', '', '### Nested', '', 'Nested body.', '', '```bash', '## Second', '```', ''].join(
        '\n',
      ),
    );
  });

  it('runs a final section to the end of the document', () => {
    expect(extractSection(MARKDOWN, 'Third')).toBe(['## Third', '', 'Third body.', ''].join('\n'));
  });

  it('trims the blank lines that separated the section from what followed', () => {
    expect(extractSection(MARKDOWN, 'Second')).toBe(['## Second', '', 'Second body.', ''].join('\n'));
  });

  it('opens no section on a heading inside a fenced block', () => {
    // The fenced `## Second` precedes the real one, so matching it would return the fence instead.
    expect(extractSection(MARKDOWN, 'Second')).not.toContain('```');
  });

  it('returns undefined for a heading the document does not have', () => {
    expect(extractSection(MARKDOWN, 'Fourth')).toBeUndefined();
  });

  it('matches a level-2 heading rather than a deeper one with the same text', () => {
    const markdown = ['### Concepts', '', 'Subsection body.', '', '## Concepts', '', 'Section body.', ''].join('\n');

    expect(extractSection(markdown, 'Concepts')).toBe(['## Concepts', '', 'Section body.', ''].join('\n'));
  });

  it('returns undefined when only a deeper heading has the text', () => {
    expect(extractSection(['## Other', '', '### Concepts', '', 'Body.', ''].join('\n'), 'Concepts')).toBeUndefined();
  });
});
