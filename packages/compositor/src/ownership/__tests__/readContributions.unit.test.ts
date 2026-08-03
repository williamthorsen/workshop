import { describe, expect, it } from 'vitest';

import type { ContributionPatterns } from '../readContributions.ts';
import { readContributions } from '../readContributions.ts';
import { renderContribution } from '../renderContribution.ts';

const PATTERNS: ContributionPatterns = {
  open: '<!-- rulebook:([a-z-]+) -->',
  close: '<!-- /rulebook:([a-z-]+) -->',
};

describe(readContributions, () => {
  it('reads each contribution the host carries, in document order', () => {
    const content =
      '<!-- rulebook:naming -->\nName functions with a verb.\n<!-- /rulebook:naming -->\n\n' +
      '<!-- rulebook:style -->\nUse sentence case.\n<!-- /rulebook:style -->\n';

    expect(readContributions(content, PATTERNS)).toStrictEqual([
      { key: 'naming', body: 'Name functions with a verb.' },
      { key: 'style', body: 'Use sentence case.' },
    ]);
  });

  it('round-trips what renderContribution wrote', () => {
    const body = 'Name functions with a verb.';
    const rendered = renderContribution({ open: '<!-- rulebook:naming -->', close: '<!-- /rulebook:naming -->' }, body);

    expect(readContributions(rendered, PATTERNS)).toStrictEqual([{ key: 'naming', body }]);
  });

  it('if a contribution is empty, reads it as an empty body rather than skipping it', () => {
    const content = '<!-- rulebook:style -->\n<!-- /rulebook:style -->\n';

    expect(readContributions(content, PATTERNS)).toStrictEqual([{ key: 'style', body: '' }]);
  });

  it('if an open marker has no close capturing the same key, does not report a contribution', () => {
    const content = '<!-- rulebook:naming -->\nbody\n<!-- /rulebook:style -->\n';

    expect(readContributions(content, PATTERNS)).toStrictEqual([]);
  });

  it('claims each close marker once, so the nearest unclaimed one closes the block that opened first', () => {
    const content =
      '<!-- rulebook:style -->\nfirst\n<!-- /rulebook:style -->\n' +
      '<!-- rulebook:style -->\nsecond\n<!-- /rulebook:style -->\n';

    expect(readContributions(content, PATTERNS)).toStrictEqual([
      { key: 'style', body: 'first' },
      { key: 'style', body: 'second' },
    ]);
  });

  it('if the host carries no contributions, reports none', () => {
    expect(readContributions('# Guidance\n', PATTERNS)).toStrictEqual([]);
  });

  it('if a pattern captures nothing, throws, the fault being the declaration and not the host', () => {
    expect(() => readContributions('', { ...PATTERNS, open: '<!-- rulebook -->' })).toThrow(
      /exactly one capture group/,
    );
  });

  it('if a pattern captures more than the key, throws', () => {
    expect(() => readContributions('', { ...PATTERNS, open: '<!-- ([a-z]+):([a-z]+) -->' })).toThrow(
      /exactly one capture group/,
    );
  });
});
