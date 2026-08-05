import { describe, expect, it } from 'vitest';

import { TOKEN_NAMES, type TokenName } from '../../src/layout/formatter.ts';
import { createLayoutEngine, resolveWorstToken, type SummaryRow } from '../../src/layout/layoutEngine.ts';
import { plainFormatter } from '../../src/layout/plainFormatter.ts';
import { richFormatter } from '../../src/layout/richFormatter.ts';
import type { SummaryCounts } from '../../src/types.ts';

/** Tokens naming a check that did not run. */
const SKIPPED_TOKENS: TokenName[] = ['blockedPrecondition', 'skippedOptional'];

const engine = createLayoutEngine(richFormatter);

const PASSED = richFormatter.tokens.passed.glyph;
const FAILED_ERROR = richFormatter.tokens.failedError.glyph;
const FAILED_WARN = richFormatter.tokens.failedWarn.glyph;
const SKIPPED = richFormatter.tokens.skippedOptional.glyph;

describe('formatCheckLine', () => {
  it('leads with the token and pads to the gutter', () => {
    expect(engine.formatCheckLine({ token: 'passed', name: 'lockfile' })).toBe(`${PASSED} lockfile`);
  });

  it('separates an inline detail with a middle dot', () => {
    const line = engine.formatCheckLine({ token: 'passed', name: 'lockfile', detail: 'up to date' });

    expect(line).toBe(`${PASSED} lockfile \u{00B7} up to date`);
  });

  it('brackets progress rather than spending a second separator on it', () => {
    const line = engine.formatCheckLine({ token: 'passed', name: 'suite', progress: '7 of 10' });

    expect(line).toBe(`${PASSED} suite [7 of 10]`);
  });

  it('carries exactly one separator when both detail and progress are present', () => {
    const line = engine.formatCheckLine({
      token: 'failedError',
      name: 'suite',
      detail: 'three specs failed',
      progress: '70%',
    });

    expect(line).toBe(`${FAILED_ERROR} suite \u{00B7} three specs failed [70%]`);
    expect(line.match(/\u{00B7}/gu)).toHaveLength(1);
  });

  it('omits the em dash the middle dot replaced', () => {
    const line = engine.formatCheckLine({ token: 'passed', name: 'lockfile', detail: 'up to date' });

    expect(line).not.toContain('\u{2014}');
  });

  describe('duration', () => {
    it('shows a duration at the floor', () => {
      expect(engine.formatCheckLine({ token: 'passed', name: 'slow', durationMs: 100 })).toBe(`${PASSED} slow (100ms)`);
    });

    it('omits a duration below the floor', () => {
      expect(engine.formatCheckLine({ token: 'passed', name: 'quick', durationMs: 99 })).toBe(`${PASSED} quick`);
    });

    it('omits a duration of zero', () => {
      expect(engine.formatCheckLine({ token: 'passed', name: 'instant', durationMs: 0 })).toBe(`${PASSED} instant`);
    });

    it('rounds a fractional duration', () => {
      expect(engine.formatCheckLine({ token: 'passed', name: 'slow', durationMs: 140.6 })).toContain('(141ms)');
    });

    it.each(SKIPPED_TOKENS)('omits the duration on a %s check however long it took', (token) => {
      expect(engine.formatCheckLine({ token, name: 'skipped', durationMs: 5_000 })).not.toContain('ms');
    });

    it('places the duration after detail and progress', () => {
      const line = engine.formatCheckLine({
        token: 'passed',
        name: 'suite',
        detail: 'all green',
        progress: '100%',
        durationMs: 250,
      });

      expect(line).toBe(`${PASSED} suite \u{00B7} all green [100%] (250ms)`);
    });
  });

  describe('alignment', () => {
    it('starts each nesting level one gutter right of the level above', () => {
      const columns = [0, 1, 2, 3].map((depth) =>
        measureNameColumn(engine.formatCheckLine({ token: 'passed', name: 'check', depth })),
      );

      expect(columns).toStrictEqual([3, 6, 9, 12]);
    });

    it('puts a child token under its parent name at every level', () => {
      for (const depth of [0, 1, 2, 3]) {
        const parent = engine.formatCheckLine({ token: 'passed', name: 'parent', depth });
        const child = engine.formatCheckLine({ token: 'failedError', name: 'child', depth: depth + 1 });

        expect(measureIndent(child)).toBe(measureNameColumn(parent));
      }
    });

    it('lands the name at one column whichever token leads the line', () => {
      const columns = TOKEN_NAMES.map((token) =>
        measureNameColumn(engine.formatCheckLine({ token, name: 'check', depth: 2 })),
      );

      expect(new Set(columns)).toStrictEqual(new Set([richFormatter.gutter * 3]));
    });
  });
});

describe('formatReasonBlock', () => {
  it('returns one line per reason', () => {
    expect(engine.formatReasonBlock(['first', 'second'])).toHaveLength(2);
  });

  it('returns nothing for no reasons', () => {
    expect(engine.formatReasonBlock([])).toStrictEqual([]);
  });

  it.each([0, 1, 2, 3])('indents a reason to the name column of the check at depth %i', (depth) => {
    const check = engine.formatCheckLine({ token: 'failedError', name: 'deps', depth });
    const [reason] = engine.formatReasonBlock(['lockfile out of date'], depth);

    expect(measureIndent(reason ?? '')).toBe(measureNameColumn(check));
  });

  it('leads with no token, so a reason never reads as a check of its own', () => {
    const [reason] = engine.formatReasonBlock(['lockfile out of date']);

    expect(reason).toBe('   lockfile out of date');
  });
});

describe('formatHeading', () => {
  it('renders a kit heading behind the heavier rule', () => {
    expect(engine.formatHeading('deploy', 'kit')).toBe('\u{2501}\u{2501} deploy');
  });

  it('weights a section heading lighter than a kit heading', () => {
    expect(engine.formatHeading('build', 'section')).toBe('\u{2500}\u{2500} build');
  });

  // Separation belongs to whoever emits the sequence, so two adjacent headings cannot each contribute one.
  it('carries no blank line of its own', () => {
    expect(engine.formatHeading('deploy', 'kit')).not.toContain('\n');
  });

  it('retires the heading grammars it replaced', () => {
    const rendered = [engine.formatHeading('deploy', 'kit'), engine.formatHeading('build', 'section')].join('\n');

    expect(rendered).not.toContain('===');
    expect(rendered).not.toContain('---');
  });
});

describe('formatBlockRule', () => {
  it('closes a block with a bare rule at section weight', () => {
    expect(engine.formatBlockRule()).toBe('\u{2500}\u{2500}');
  });

  // A heading always carries text after its rule, so the bare form cannot be mistaken for one.
  it('carries no text, so it does not read as a heading', () => {
    expect(engine.formatBlockRule()).not.toContain(' ');
  });
});

describe('formatBreadcrumb', () => {
  it('parts each segment from the next with a spaced separator', () => {
    const rendered = engine.formatBreadcrumb(
      [
        { role: 'sourcePackage', text: '@acme/release-kit@2.1.0' },
        { role: 'kit', text: 'npm-auto-publish' },
        { role: 'checklist', text: 'repo' },
      ],
      'kit',
    );

    expect(rendered).toBe('\u{2501}\u{2501} 📦 @acme/release-kit@2.1.0 / 🧰 npm-auto-publish / 📋 repo');
  });

  it('renders a lone segment without a separator', () => {
    expect(engine.formatBreadcrumb([{ role: 'checklist', text: 'repo' }], 'kit')).toBe('\u{2501}\u{2501} 📋 repo');
  });

  // The spacing is the only segment boundary a glyphless style offers, and segment texts carry slashes
  // of their own, so a bare separator would leave nothing to read the breadcrumb by.
  it('keeps the separator spaced where a role has no glyph', () => {
    const plain = createLayoutEngine(plainFormatter);
    const rendered = plain.formatBreadcrumb(
      [
        { role: 'sourcePackage', text: '@acme/release-kit@2.1.0' },
        { role: 'kit', text: 'npm-auto-publish' },
      ],
      'kit',
    );

    expect(rendered).toBe('== @acme/release-kit@2.1.0 / npm-auto-publish');
  });
});

describe('formatCounts', () => {
  it('joins non-zero fields with pipes in the fixed order', () => {
    const counts = makeCounts({
      passed: 14,
      errors: 1,
      warnings: 1,
      recommendations: 2,
      blocked: 5,
      optional: 2,
      worstSeverity: 'error',
    });

    expect(engine.formatCounts(counts)).toBe(
      '14 passed | 1 error | 1 warning | 2 recommendations | 5 blocked | 2 skipped',
    );
  });

  it('omits zero-count fields', () => {
    expect(engine.formatCounts(makeCounts({ passed: 3, warnings: 1, worstSeverity: 'warn' }))).toBe(
      '3 passed | 1 warning',
    );
  });

  it('reports zero counts as a statement rather than an empty segment', () => {
    expect(engine.formatCounts(makeCounts())).toBe('0 passed');
  });

  it('pluralizes the severity labels', () => {
    expect(engine.formatCounts(makeCounts({ errors: 2, warnings: 2, recommendations: 2 }))).toBe(
      '2 errors | 2 warnings | 2 recommendations',
    );
  });

  it('leaves the skip labels unchanged for any count', () => {
    expect(engine.formatCounts(makeCounts({ blocked: 3, optional: 4 }))).toBe('3 blocked | 4 skipped');
  });

  it('carries no per-field tokens', () => {
    const counts = makeCounts({ passed: 1, errors: 1, blocked: 1, optional: 1, worstSeverity: 'error' });

    for (const { glyph } of Object.values(richFormatter.tokens)) {
      expect(engine.formatCounts(counts)).not.toContain(glyph);
    }
  });
});

describe('formatCountLine', () => {
  it('leads with the worst severity rather than the first non-zero field', () => {
    const counts = makeCounts({ passed: 9, errors: 1, worstSeverity: 'error' });

    expect(engine.formatCountLine(counts, 1_200)).toBe(`${FAILED_ERROR} 9 passed | 1 error (1200ms)`);
  });

  it('leads with the passed token when nothing failed', () => {
    expect(engine.formatCountLine(makeCounts({ passed: 4 }), 300)).toBe(`${PASSED} 4 passed (300ms)`);
  });

  it('shows a duration below the check-line floor', () => {
    expect(engine.formatCountLine(makeCounts({ passed: 1 }), 4)).toContain('(4ms)');
  });

  it('places an optional label between the token and the counts', () => {
    expect(engine.formatCountLine(makeCounts({ passed: 2 }), 500, 'Total:')).toBe(`${PASSED} Total: 2 passed (500ms)`);
  });

  it('leads a blocked-only run with the passed token, since nothing failed', () => {
    expect(engine.formatCountLine(makeCounts({ blocked: 2 }), 100)).toBe(`${PASSED} 2 blocked (100ms)`);
  });
});

describe('formatSummaryTable', () => {
  const input = {
    rows: [
      makeRow({ name: 'build', counts: makeCounts({ passed: 2 }), durationMs: 410 }),
      makeRow({
        name: 'integration',
        counts: makeCounts({ passed: 1, errors: 1, worstSeverity: 'error' }),
        durationMs: 1_400,
      }),
    ],
    totals: makeCounts({ passed: 3, errors: 1, worstSeverity: 'error' }),
    totalDurationMs: 1_810,
  };

  /** Returns a rendered table line's width in display columns, its leading token counted as one gutter. */
  function measureWidth(line: string): number {
    const glyph = String.fromCodePoint(line.codePointAt(0) ?? 0);
    const token = Object.values(richFormatter.tokens).find((entry) => entry.glyph === glyph);
    if (token === undefined) return line.length;

    const rendered = glyph + ' '.repeat(richFormatter.gutter - token.width);
    return richFormatter.gutter + line.slice(rendered.length).length;
  }

  it('renders a heading, two rules, one row per checklist, and a total', () => {
    const lines = engine.formatSummaryTable(input);

    expect(lines[0]).toBe('\u{2501}\u{2501} Summary');
    expect(lines[2]).toMatch(/^\S build\s+410ms {2}2 passed$/u);
    expect(lines[3]).toMatch(/^\S integration {2}1400ms {2}1 passed \| 1 error$/u);
    expect(lines.at(-1)).toBe(`${FAILED_ERROR} Total: 3 passed | 1 error (1810ms)`);
    expect(lines).toHaveLength(6);
  });

  // The run's writer parts one block from the next, so a table carrying its own blanks would double the gap.
  it('carries no blank line of its own', () => {
    expect(engine.formatSummaryTable(input)).not.toContain('');
  });

  it('sizes both rules equally', () => {
    const lines = engine.formatSummaryTable(input);

    expect(lines[1]).toBe(lines[4]);
    expect(lines[1]).toMatch(/^\u{2500}+$/u);
  });

  it('sizes the rules to the widest line they enclose', () => {
    const lines = engine.formatSummaryTable(input);
    const widest = Math.max(...[lines[2], lines[3], lines[5]].map((line) => measureWidth(line ?? '')));

    expect(lines[1]?.length).toBe(widest);
  });

  it('sizes the rules to the total line when it is the widest', () => {
    const lines = engine.formatSummaryTable({
      rows: [makeRow({ name: 'a', counts: makeCounts({ passed: 1 }), durationMs: 1 })],
      totals: makeCounts({ passed: 1, errors: 1, warnings: 1, recommendations: 1, worstSeverity: 'error' }),
      totalDurationMs: 9,
    });

    expect(lines[1]?.length).toBe(measureWidth(lines.at(-1) ?? ''));
  });

  it('pads names so the counts column starts at one place in every row', () => {
    const lines = engine.formatSummaryTable(input);

    expect(lines[2]?.indexOf('2 passed')).toBe(lines[3]?.indexOf('1 passed'));
  });

  it('right-aligns durations', () => {
    const lines = engine.formatSummaryTable(input);

    expect(lines[2]).toContain(' 410ms');
    expect(lines[3]).toContain('1400ms');
  });

  it('leads each row with the worst severity of that checklist alone', () => {
    const lines = engine.formatSummaryTable({
      rows: [
        makeRow({ name: 'warned', counts: makeCounts({ warnings: 1, worstSeverity: 'warn' }) }),
        makeRow({ name: 'clean', counts: makeCounts({ passed: 1 }) }),
      ],
      totals: makeCounts({ passed: 1, warnings: 1, worstSeverity: 'warn' }),
      totalDurationMs: 200,
    });

    expect(lines[2]?.startsWith(FAILED_WARN)).toBe(true);
    expect(lines[3]?.startsWith(PASSED)).toBe(true);
  });

  it('handles a single row', () => {
    const lines = engine.formatSummaryTable({
      rows: [makeRow({ name: 'only', counts: makeCounts({ passed: 1 }), durationMs: 100 })],
      totals: makeCounts({ passed: 1 }),
      totalDurationMs: 100,
    });

    expect(lines).toHaveLength(5);
  });
});

describe(resolveWorstToken, () => {
  it.each([
    ['error', 'failedError'],
    ['warn', 'failedWarn'],
    ['recommend', 'failedRecommend'],
  ] as const)('maps %s to %s', (severity, expected) => {
    expect(resolveWorstToken(severity)).toBe(expected);
  });

  it('maps a run with no failures to the passed token', () => {
    expect(resolveWorstToken(null)).toBe('passed');
  });
});

describe('token and glyph', () => {
  it('pads a token to the gutter', () => {
    expect(engine.token('passed')).toBe(`${PASSED} `);
  });

  it('returns a glyph and one space for mid-line placement', () => {
    expect(engine.inlineGlyph('kit')).toBe(`${richFormatter.tokens.kit.glyph} `);
    expect(engine.inlineGlyph('skippedOptional')).toBe(`${SKIPPED} `);
  });

  it('returns nothing for a token the formatter gives no glyph, so no orphan space is left behind', () => {
    const glyphless = createLayoutEngine({
      ...richFormatter,
      tokens: { ...richFormatter.tokens, kit: { glyph: '', width: 0 } },
    });

    expect(glyphless.inlineGlyph('kit')).toBe('');
  });

  it('indents by one gutter per level', () => {
    expect(engine.indent(0)).toBe('');
    expect(engine.indent(3)).toBe(' '.repeat(9));
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

function makeRow(overrides?: Partial<SummaryRow>): SummaryRow {
  return { name: 'checklist', counts: makeCounts({ passed: 1 }), durationMs: 100, ...overrides };
}

/**
 * Returns the display column at which a rendered line's name begins.
 *
 * Counts terminal cells, taking each glyph's width from the formatter, so a two-cell glyph counts twice.
 */
function measureNameColumn(line: string): number {
  const match = /^(?<indent> *)(?<glyph>\P{White_Space})(?<pad> +)/u.exec(line);
  const groups = match?.groups;
  if (groups === undefined) throw new Error(`Not a token-led line: ${JSON.stringify(line)}`);

  const token = Object.values(richFormatter.tokens).find((entry) => entry.glyph === groups.glyph);
  if (token === undefined) throw new Error(`Unknown glyph: ${JSON.stringify(groups.glyph)}`);

  return (groups.indent?.length ?? 0) + token.width + (groups.pad?.length ?? 0);
}

/** Returns a line's count of leading spaces, one per column. */
function measureIndent(line: string): number {
  return line.length - line.trimStart().length;
}

// endregion | Helpers
