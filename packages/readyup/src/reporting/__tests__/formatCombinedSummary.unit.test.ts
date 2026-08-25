import { describe, expect, it } from 'vitest';

import type { SummaryCounts } from '../../kits/types.ts';
import type { SummaryRow } from '../../layout/layoutEngine.ts';
import { richFormatter } from '../../layout/richFormatter.ts';
import { formatCombinedSummary } from '../formatCombinedSummary.ts';

const PASSED = richFormatter.tokens.passed.glyph;
const FAILED_ERROR = richFormatter.tokens.failedError.glyph;
const FAILED_WARN = richFormatter.tokens.failedWarn.glyph;
const FAILED_RECOMMEND = richFormatter.tokens.failedRecommend.glyph;

/** What a test row varies: the counts it reports, flattened, alongside its name and duration. */
type RowOverrides = Partial<SummaryCounts> & { durationMs?: number; name?: string };

function makeRow({ durationMs = 100, name = 'test-checklist', ...counts }: RowOverrides = {}): SummaryRow {
  return {
    counts: {
      passed: 3,
      errors: 0,
      warnings: 0,
      recommendations: 0,
      blocked: 0,
      optional: 0,
      worstSeverity: null,
      ...counts,
    },
    durationMs,
    segments: [{ role: 'checklist', text: name }],
  };
}

/** Returns the table's lines, the leading blank included. */
function renderLines(rows: SummaryRow[]): string[] {
  return formatCombinedSummary(rows).split('\n');
}

describe(formatCombinedSummary, () => {
  // The run's writer separates one block from the next, so a table with its own blank would double the gap.
  it('renders no separation of its own', () => {
    expect(renderLines([makeRow()])[0]).not.toBe('');
  });

  it('heads the table as a block of the run rather than a full-width banner', () => {
    const lines = renderLines([makeRow()]);

    expect(lines[0]).toBe('\u{2501}\u{2501} Summary');
  });

  it('encloses the rows in two equal rules', () => {
    const lines = renderLines([makeRow()]);

    expect(lines[1]).toMatch(/^\u{2500}+$/u);
    expect(lines[3]).toBe(lines[1]);
  });

  it.each([
    ['nothing failed', {}, PASSED],
    ['an error failed', { errors: 1, worstSeverity: 'error' as const }, FAILED_ERROR],
    ['a warning failed', { warnings: 1, worstSeverity: 'warn' as const }, FAILED_WARN],
    ['a recommendation failed', { recommendations: 1, worstSeverity: 'recommend' as const }, FAILED_RECOMMEND],
  ])('leads a row with the worst-severity token when %s', (_case, overrides, token) => {
    const output = formatCombinedSummary([makeRow({ name: 'deploy', ...overrides })]);

    expect(output).toContain(`${token} deploy`);
  });

  it('renders each row as name, duration, then comma-joined counts', () => {
    const output = formatCombinedSummary([
      makeRow({ name: 'infra', passed: 2, errors: 1, worstSeverity: 'error', durationMs: 45 }),
    ]);

    expect(output).toContain(`${FAILED_ERROR} infra  45ms  1 error, 2 passed`);
  });

  it('omits zero-count fields from a row', () => {
    const output = formatCombinedSummary([makeRow({ name: 'deploy', passed: 5, durationMs: 200 })]);

    expect(output).toContain(`${PASSED} deploy  200ms  5 passed`);
    expect(output).not.toContain('|');
  });

  it('includes skip fields in a row when their counts are non-zero', () => {
    const output = formatCombinedSummary([
      makeRow({ name: 'checks', passed: 1, errors: 1, blocked: 2, optional: 1, worstSeverity: 'error' }),
    ]);

    expect(output).toContain('1 error, 1 passed, 2 blocked, 1 skipped');
  });

  it('retires the prose count grammar', () => {
    const output = formatCombinedSummary([
      makeRow({ name: 'infra', passed: 2, errors: 1, blocked: 1, worstSeverity: 'error' }),
    ]);

    expect(output).not.toContain('Failed:');
    expect(output).not.toContain('Skipped:');
  });

  describe('total line', () => {
    it('leads with the aggregate worst severity and sums the durations', () => {
      const output = formatCombinedSummary([
        makeRow({ passed: 10, durationMs: 100 }),
        makeRow({ name: 'other', passed: 5, errors: 2, blocked: 1, worstSeverity: 'error', durationMs: 200 }),
      ]);

      expect(output.split('\n').at(-1)).toBe(`${FAILED_ERROR} Total: 2 errors, 15 passed, 1 blocked (300ms)`);
    });

    it('leads with the passed token when no checklist failed', () => {
      const output = formatCombinedSummary([
        makeRow({ passed: 3, durationMs: 50 }),
        makeRow({ name: 'other', passed: 7, durationMs: 150 }),
      ]);

      expect(output.split('\n').at(-1)).toBe(`${PASSED} Total: 10 passed (200ms)`);
    });

    it('escalates to the worst severity across checklists', () => {
      const output = formatCombinedSummary([
        makeRow({ name: 'only-recommend', passed: 0, recommendations: 1, worstSeverity: 'recommend' }),
        makeRow({ name: 'has-warn', passed: 0, warnings: 1, worstSeverity: 'warn' }),
      ]);
      const totalLine = output.split('\n').at(-1);

      expect(totalLine?.startsWith(FAILED_WARN)).toBe(true);
      expect(totalLine).toContain('1 warning, 1 recommendation');
      expect(totalLine).not.toContain('passed');
    });

    it('renders no per-field tokens', () => {
      const output = formatCombinedSummary([makeRow({ passed: 1, errors: 1, worstSeverity: 'error' })]);
      const totalLine = output.split('\n').at(-1) ?? '';

      expect(totalLine.slice(FAILED_ERROR.length)).not.toContain(PASSED);
    });
  });

  it('left-aligns names and right-aligns durations across rows', () => {
    const lines = renderLines([makeRow({ name: 'ab', durationMs: 5 }), makeRow({ name: 'cdef', durationMs: 1_200 })]);

    expect(lines[2]).toContain(`${PASSED} ab       5ms`);
    expect(lines[3]).toContain(`${PASSED} cdef  1200ms`);
  });

  it('sizes the rules to the widest line rather than a fixed width', () => {
    const narrow = renderLines([makeRow({ name: 'a', passed: 1, durationMs: 1 })]);
    const wide = renderLines([makeRow({ name: 'a-considerably-longer-checklist-name', passed: 1, durationMs: 1 })]);

    expect(wide[1]?.length).toBeGreaterThan(narrow[1]?.length ?? 0);
  });
});
