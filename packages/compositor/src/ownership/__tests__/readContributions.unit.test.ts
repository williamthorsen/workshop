import { describe, expect, it } from 'vitest';

import type { ContributionPatterns } from '../readContributions.ts';
import { readContributions } from '../readContributions.ts';
import { renderContribution } from '../renderContribution.ts';

const PATTERNS: ContributionPatterns = {
  open: '^<!-- rulebook:([a-z-]+) -->$',
  close: '^<!-- /rulebook:([a-z-]+) -->$',
};

describe(readContributions, () => {
  it('reads each contribution the host contains, in document order', () => {
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

  it('if the host has no contributions, reports none', () => {
    expect(readContributions('# Guidance\n', PATTERNS)).toStrictEqual([]);
  });

  it('does not read a marker quoted inside prose as a contribution, an anchored pattern binding to its line', () => {
    const content = 'Write `<!-- rulebook:style -->` to open and `<!-- /rulebook:style -->` to close.\n';

    expect(readContributions(content, PATTERNS)).toStrictEqual([]);
  });

  it('reads a contribution whose markers are indented, as a host nesting them would write them', () => {
    const patterns: ContributionPatterns = {
      open: String.raw`^[ \t]*# rulebook:([a-z-]+)$`,
      close: String.raw`^[ \t]*# \/rulebook:([a-z-]+)$`,
    };
    const content = 'prompts:\n  # rulebook:style\n  - name: style\n  # /rulebook:style\n';

    expect(readContributions(content, patterns)).toStrictEqual([{ key: 'style', body: '  - name: style' }]);
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
