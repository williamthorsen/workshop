import { describe, expect, it } from 'vitest';

import { plainFormatter, richFormatter } from '../formatter.ts';
import { createLayoutEngine } from '../layoutEngine.ts';
import { makeCounts, makeRow } from '../test-utils/summary-fixtures.ts';

/** Columns that the engine reserves for a rich token: its two cells and the space after them. */
const RICH_GUTTER = 3;

const engine = createLayoutEngine(richFormatter);

const PASSED = richFormatter.tokens.passed.text;
const FAILED_ERROR = richFormatter.tokens.failedError.text;
const FAILED_WARN = richFormatter.tokens.failedWarn.text;

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
    const token = Object.values(richFormatter.tokens).find((entry) => entry.text === glyph);
    if (token === undefined) return line.length;

    const rendered = glyph + ' '.repeat(RICH_GUTTER - token.width);
    return RICH_GUTTER + line.slice(rendered.length).length;
  }

  it('renders a heading, two rules, one row per checklist, and a total', () => {
    const lines = engine.formatSummaryTable(input);

    expect(lines[0]).toBe('\u{2501}\u{2501} Summary');
    expect(lines[2]).toMatch(/^\S build\s+410ms {2}2 passed$/u);
    expect(lines[3]).toMatch(/^\S integration {2}1400ms {2}1 error, 1 passed$/u);
    expect(lines.at(-1)).toBe(`${FAILED_ERROR} Total: 1 error, 3 passed (1810ms)`);
    expect(lines).toHaveLength(6);
  });

  // The run's writer separates one block from the next, so a table with its own blanks would double the gap.
  it('renders no blank line of its own', () => {
    expect(engine.formatSummaryTable(input)).not.toContain('');
  });

  it('sizes both rules equally', () => {
    const lines = engine.formatSummaryTable(input);

    expect(lines[1]).toBe(lines[4]);
    expect(lines[1]).toMatch(/^\u{2500}+$/u);
  });

  it('sizes the rules to the widest line that they enclose', () => {
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

  it('pads names so that the counts column starts at one place in every row', () => {
    const lines = engine.formatSummaryTable(input);

    expect(lines[2]?.indexOf('2 passed')).toBe(lines[3]?.indexOf('1 error'));
  });

  it('fails the row and the total of a kit that did not load', () => {
    const lines = engine.formatSummaryTable({
      rows: [
        makeRow({ name: 'build', counts: makeCounts({ passed: 2 }), durationMs: 410 }),
        makeRow({ name: 'broken', counts: makeCounts(), didNotLoad: true, durationMs: 0 }),
      ],
      totals: makeCounts({ passed: 2 }),
      totalDurationMs: 410,
    });

    expect(lines[3]).toMatch(new RegExp(`^${FAILED_ERROR} +broken {2}did not load$`, 'u'));
    expect(lines.at(-1)).toBe(`${FAILED_ERROR} Total: 2 passed (410ms)`);
  });

  it('starts the did-not-load text at the duration column', () => {
    const lines = engine.formatSummaryTable({
      rows: [
        makeRow({ name: 'build', counts: makeCounts({ passed: 2 }), durationMs: 410 }),
        makeRow({ name: 'broken', counts: makeCounts(), didNotLoad: true, durationMs: 0 }),
      ],
      totals: makeCounts({ passed: 2 }),
      totalDurationMs: 410,
    });

    expect(lines[3]?.indexOf('did not load')).toBe(lines[2]?.indexOf('410ms'));
  });

  it('renders a table in which no kit loaded', () => {
    const lines = engine.formatSummaryTable({
      rows: [
        makeRow({ name: 'a', counts: makeCounts(), didNotLoad: true, durationMs: 0 }),
        makeRow({ name: 'b', counts: makeCounts(), didNotLoad: true, durationMs: 0 }),
      ],
      totals: makeCounts(),
      totalDurationMs: 0,
    });

    expect(lines[2]).toMatch(new RegExp(`^${FAILED_ERROR} +a {2}did not load$`, 'u'));
    expect(lines.at(-1)?.startsWith(FAILED_ERROR)).toBe(true);
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

  it('names a row by its breadcrumb, with no role glyphs', () => {
    const lines = engine.formatSummaryTable({
      rows: [
        makeRow({
          segments: [
            { role: 'sourcePackage', text: '@acme/release-kit@2.1.0' },
            { role: 'kit', text: 'default' },
            { role: 'checklist', text: 'repo' },
          ],
        }),
      ],
      totals: makeCounts({ passed: 1 }),
      totalDurationMs: 100,
    });

    expect(lines[2]).toBe(`${PASSED} @acme/release-kit@2.1.0 / default / repo  100ms  1 passed`);
  });

  it('pads to the widest breadcrumb when rows have different segment counts', () => {
    const lines = engine.formatSummaryTable({
      rows: [
        makeRow({
          segments: [
            { role: 'sourcePackage', text: '@acme/long-package-name' },
            { role: 'kit', text: 'default' },
          ],
        }),
        makeRow({ segments: [{ role: 'checklist', text: 'short' }] }),
      ],
      totals: makeCounts({ passed: 2 }),
      totalDurationMs: 200,
    });

    expect(lines[2]?.indexOf('1 passed')).toBe(lines[3]?.indexOf('1 passed'));
  });

  it('handles a single row', () => {
    const lines = engine.formatSummaryTable({
      rows: [makeRow({ name: 'only', counts: makeCounts({ passed: 1 }), durationMs: 100 })],
      totals: makeCounts({ passed: 1 }),
      totalDurationMs: 100,
    });

    expect(lines).toHaveLength(5);
  });

  describe('at a limited width', () => {
    // Breadcrumbs as long as those of a real `--sources` run, too long for a one-line row at 80 columns.
    const wideInput = {
      rows: [
        makeRow({
          segments: [
            { role: 'sourcePackage', text: '@williamthorsen/eslint-config-typescript@18.0.0' },
            { role: 'kit', text: 'default' },
            { role: 'checklist', text: 'projectservice' },
          ],
          counts: makeCounts({ passed: 2 }),
          durationMs: 25,
        }),
        makeRow({
          segments: [
            { role: 'sourcePackage', text: '@williamthorsen/toolbelt.vitest@0.10.3' },
            { role: 'kit', text: 'default' },
          ],
          counts: makeCounts({ passed: 7, recommendations: 1, worstSeverity: 'recommend' }),
          durationMs: 1_363,
        }),
      ],
      totals: makeCounts({ passed: 9, recommendations: 1, worstSeverity: 'recommend' }),
      totalDurationMs: 1_388,
    };

    it('keeps one line per row when every row fits', () => {
      expect(engine.formatSummaryTable({ ...input, width: 80 })).toStrictEqual(engine.formatSummaryTable(input));
    });

    it('keeps one line per row when the width has no limit', () => {
      expect(engine.formatSummaryTable({ ...wideInput, width: Infinity })).toHaveLength(6);
    });

    it('stacks every row onto two lines when one does not fit', () => {
      const lines = engine.formatSummaryTable({ ...wideInput, width: 80 });

      expect(lines).toHaveLength(8);
      expect(lines[2]).toBe(`${PASSED} @williamthorsen/eslint-config-typescript@18.0.0 / default / projectservice`);
      expect(lines[3]).toBe('     25ms  2 passed');
      expect(lines[5]).toBe('   1363ms  1 recommendation, 7 passed');
    });

    it.each([
      ['rich', engine, measureWidth],
      ['plain', createLayoutEngine(plainFormatter), (line: string) => line.length],
    ])('fits every line within the width under the %s style', (_style, styleEngine, measure) => {
      const lines = styleEngine.formatSummaryTable({ ...wideInput, width: 80 });

      expect(Math.max(...lines.map((line) => measure(line)))).toBeLessThanOrEqual(80);
    });

    it('starts the counts of every stacked row at one column', () => {
      const lines = engine.formatSummaryTable({ ...wideInput, width: 80 });

      expect(lines[3]?.indexOf('2 passed')).toBe(lines[5]?.indexOf('1 recommendation'));
    });

    it('starts the second line of a stacked row at the name column', () => {
      const plainEngine = createLayoutEngine(plainFormatter);
      const lines = plainEngine.formatSummaryTable({ ...wideInput, width: 80 });
      const nameColumn = lines[2]?.indexOf('@') ?? -1;

      // The widest duration has no padding, so it starts where the column starts.
      expect(lines[5]?.search(/\S/u)).toBe(nameColumn);
    });

    it('stacks the row of a kit that did not load', () => {
      const lines = engine.formatSummaryTable({
        ...wideInput,
        rows: [...wideInput.rows, makeRow({ name: 'broken', counts: makeCounts(), didNotLoad: true, durationMs: 0 })],
        width: 80,
      });

      expect(lines[6]).toBe(`${FAILED_ERROR} broken`);
      expect(lines[7]).toBe('   did not load');
    });

    it('caps the rules at the width when a name overflows it', () => {
      const lines = engine.formatSummaryTable({
        rows: [makeRow({ name: 'x'.repeat(100) })],
        totals: makeCounts({ passed: 1 }),
        totalDurationMs: 100,
        width: 80,
      });

      expect(lines[1]).toHaveLength(80);
      expect(lines[2]).toContain('x'.repeat(100));
    });
  });
});
