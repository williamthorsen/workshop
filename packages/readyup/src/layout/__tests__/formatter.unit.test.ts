import { describe, expect, it } from 'vitest';

import type { SummaryCounts } from '../../kits/types.ts';
import { plainFormatter, richFormatter, TOKEN_NAMES } from '../formatter.ts';
import { createLayoutEngine } from '../layoutEngine.ts';

/** Every printable ASCII character, plus the newline that separates rendered lines. */
const PRINTABLE_ASCII = /^[\u{20}-\u{7E}\n]*$/u;

/** Glyphs that no token may use, each stripped of any variation selector. */
const RETIRED_GLYPHS = ['\u{1F9F0}', '\u{23ED}', '\u{2705}', '\u{26A0}', '\u{274C}', '\u{2753}', '\u{2796}'];

/** Tokens that name what a thing is rather than reporting an outcome. */
const ROLE_TOKENS = ['checklist', 'kit', 'kitSource', 'sourceDirectory', 'sourcePackage', 'sourceRemote'] as const;

const plainEngine = createLayoutEngine(plainFormatter);

const richEntries = TOKEN_NAMES.map((name) => ({ name, ...richFormatter.tokens[name] }));

describe('plainFormatter', () => {
  it('distinguishes the heading levels by rule character', () => {
    expect(plainFormatter.rules.kit).not.toBe(plainFormatter.rules.section);
  });

  it.each(ROLE_TOKENS)('gives %s no glyph, so it is omitted rather than substituted', (token) => {
    expect(plainFormatter.tokens[token].text).toBe('');
  });
});

describe('richFormatter', () => {
  it('retires every glyph withdrawn from use', () => {
    const glyphs = richEntries.map((entry) => entry.text);

    for (const retired of RETIRED_GLYPHS) {
      expect(glyphs).not.toContain(retired);
    }
  });

  it('distinguishes the heading levels by rule weight', () => {
    expect(richFormatter.rules.kit).not.toBe(richFormatter.rules.section);
  });

  // Anchoring on the property rather than the glyph verifies the two-cell width assumed by the label.
  it('leads a hint with an emoji that renders wide unaided', () => {
    expect(richFormatter.hintPrefix).toBe('💡 Hint:');
    expect(richFormatter.hintPrefix).toMatch(/^\p{Emoji_Presentation} /u);
  });

  describe.each(richEntries)('$name', ({ text }) => {
    // `Emoji_Presentation` is the property that makes a code point occupy two cells unaided, which is the
    // width that the engine pads against. Anchoring to one property also rejects multi-code-point sequences.
    it('is one code point that renders wide unaided', () => {
      expect(text).toMatch(/^\p{Emoji_Presentation}$/u);
    });
  });
});

describe('plain rendered output', () => {
  it('is printable ASCII throughout', () => {
    expect(renderEverything()).toMatch(PRINTABLE_ASCII);
  });

  it('spells each status as a word that a log search can find', () => {
    expect(plainEngine.formatCheckLine({ token: 'failedError', name: 'migrations' })).toBe('FAIL  migrations');
  });

  it('reserves the gutter for a token with no glyph, so names stay in one column', () => {
    const noun = plainEngine.formatCheckLine({ token: 'kit', name: 'deploy' });
    const status = plainEngine.formatCheckLine({ token: 'passed', name: 'deploy' });

    expect(measureNameColumn(noun)).toBe(measureNameColumn(status));
    expect(noun).toBe('      deploy');
  });

  it('separates a detail from the name with an ASCII separator', () => {
    expect(plainEngine.formatCheckLine({ token: 'failedWarn', name: 'lint', detail: 'not installed' })).toBe(
      'WARN  lint - not installed',
    );
  });

  it('heads a section with an ASCII rule', () => {
    expect(plainEngine.formatHeading('code-quality', 'section')).toBe('-- code-quality');
    expect(plainEngine.formatHeading('deploy', 'kit')).toBe('== deploy');
  });

  it('labels a hint with an ASCII word', () => {
    expect(plainEngine.formatHint('set GITHUB_TOKEN')).toBe('Hint: set GITHUB_TOKEN');
  });
});

describe('plain alignment', () => {
  it('starts each nesting level one gutter right of the level above', () => {
    const columns = [0, 1, 2, 3].map((depth) =>
      measureNameColumn(plainEngine.formatCheckLine({ token: 'passed', name: 'check', depth })),
    );

    expect(columns).toStrictEqual([6, 12, 18, 24]);
  });

  it('puts a child token under its parent name at every level', () => {
    for (const depth of [0, 1, 2, 3]) {
      const parent = plainEngine.formatCheckLine({ token: 'passed', name: 'parent', depth });
      const child = plainEngine.formatCheckLine({ token: 'blockedPrecondition', name: 'child', depth: depth + 1 });

      expect(measureIndent(child)).toBe(measureNameColumn(parent));
    }
  });

  it('lands the name at one column whichever token leads the line', () => {
    const columns = TOKEN_NAMES.map((token) =>
      measureNameColumn(plainEngine.formatCheckLine({ token, name: 'check', depth: 2 })),
    );

    expect(new Set(columns)).toStrictEqual(new Set([18]));
  });

  it('holds the column through three levels of nesting, widest token included', () => {
    const rendered = [
      plainEngine.formatCheckLine({ token: 'failedError', name: 'bitbucket-pipelines.yml exists' }),
      plainEngine.formatCheckLine({ token: 'blockedPrecondition', name: 'pipeline runs checks', depth: 1 }),
      plainEngine.formatCheckLine({ token: 'skippedOptional', name: 'branch-protection query', depth: 2 }),
    ].join('\n');

    expect(rendered).toBe(
      [
        'FAIL  bitbucket-pipelines.yml exists',
        '      BLOCK pipeline runs checks',
        '            SKIP  branch-protection query',
      ].join('\n'),
    );
  });
});

// region | Helpers

function makeCounts(overrides?: Partial<SummaryCounts>): SummaryCounts {
  return {
    passed: 0,
    errors: 0,
    warnings: 0,
    recommendations: 0,
    blocked: 0,
    optional: 0,
    worstSeverity: null,
    ...overrides,
  };
}

/** Returns the display column at which a rendered line's name begins. */
function measureNameColumn(line: string): number {
  const match = /^(?<indent> *)(?<word>[A-Z]*)(?<pad> +)/u.exec(line);
  const groups = match?.groups;
  if (groups === undefined) throw new Error(`Not a token-led line: ${JSON.stringify(line)}`);
  const { indent, pad, word } = groups;

  return (indent?.length ?? 0) + (word?.length ?? 0) + (pad?.length ?? 0);
}

/** Returns a line's count of leading spaces, one per column. */
function measureIndent(line: string): number {
  return line.length - line.trimStart().length;
}

/** Returns every line that the engine can produce, so a whole-vocabulary assertion has something to run against. */
function renderEverything(): string {
  const counts = makeCounts({ passed: 2, errors: 1, warnings: 1, recommendations: 1, blocked: 1, optional: 1 });

  return [
    ...TOKEN_NAMES.map((token) =>
      plainEngine.formatCheckLine({
        token,
        name: 'check',
        detail: 'detail',
        progress: '50%',
        durationMs: 250,
        depth: 1,
      }),
    ),
    plainEngine.formatHeading('deploy', 'kit'),
    plainEngine.formatHeading('build', 'section'),
    plainEngine.formatBreadcrumb(
      [
        { role: 'sourcePackage', text: '@acme/release-kit@2.1.0' },
        { role: 'kit', text: 'npm-auto-publish' },
        { role: 'checklist', text: 'repo' },
      ],
      'kit',
    ),
    ...plainEngine.formatReasonBlock(['a reason'], 2),
    plainEngine.formatHint('set a token'),
    plainEngine.formatCountLine(counts, 800),
    ...plainEngine.formatSummaryTable({
      rows: [
        { counts: makeCounts({ passed: 2 }), durationMs: 410, segments: [{ role: 'checklist', text: 'build' }] },
        {
          counts,
          durationMs: 1_400,
          segments: [
            { role: 'sourcePackage', text: '@acme/release-kit@2.1.0' },
            { role: 'kit', text: 'npm-auto-publish' },
            { role: 'checklist', text: 'integration' },
          ],
        },
      ],
      totals: counts,
      totalDurationMs: 1_810,
    }),
    ...TOKEN_NAMES.map((token) => plainEngine.inlineGlyph(token)),
  ].join('\n');
}

// endregion | Helpers
