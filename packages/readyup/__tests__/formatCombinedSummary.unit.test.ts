import { describe, expect, it } from 'vitest';

import { formatCombinedSummary } from '../src/formatCombinedSummary.ts';
import { richFormatter } from '../src/layout/richFormatter.ts';
import type { ChecklistSummary } from '../src/types.ts';

const PASSED = richFormatter.tokens.passed.glyph;
const FAILED_ERROR = richFormatter.tokens.failedError.glyph;
const FAILED_WARN = richFormatter.tokens.failedWarn.glyph;
const FAILED_RECOMMEND = richFormatter.tokens.failedRecommend.glyph;

function makeSummary(overrides?: Partial<ChecklistSummary>): ChecklistSummary {
  return {
    name: 'test-checklist',
    passed: 3,
    errors: 0,
    warnings: 0,
    recommendations: 0,
    blocked: 0,
    optional: 0,
    worstSeverity: null,
    durationMs: 100,
    ...overrides,
  };
}

/** Returns the table's lines, the leading blank included. */
function renderLines(summaries: ChecklistSummary[]): string[] {
  return formatCombinedSummary(summaries).split('\n');
}

describe(formatCombinedSummary, () => {
  // The run's writer parts one block from the next, so a table carrying its own blank would double the gap.
  it('carries no separation of its own', () => {
    expect(renderLines([makeSummary()])[0]).not.toBe('');
  });

  it('heads the table as a block of the run rather than a full-width banner', () => {
    const lines = renderLines([makeSummary()]);

    expect(lines[0]).toBe('\u{2501}\u{2501} Summary');
  });

  it('encloses the rows in two equal rules', () => {
    const lines = renderLines([makeSummary()]);

    expect(lines[1]).toMatch(/^\u{2500}+$/u);
    expect(lines[3]).toBe(lines[1]);
  });

  it.each([
    ['nothing failed', {}, PASSED],
    ['an error failed', { errors: 1, worstSeverity: 'error' as const }, FAILED_ERROR],
    ['a warning failed', { warnings: 1, worstSeverity: 'warn' as const }, FAILED_WARN],
    ['a recommendation failed', { recommendations: 1, worstSeverity: 'recommend' as const }, FAILED_RECOMMEND],
  ])('leads a row with the worst-severity token when %s', (_case, overrides, token) => {
    const output = formatCombinedSummary([makeSummary({ name: 'deploy', ...overrides })]);

    expect(output).toContain(`${token} deploy`);
  });

  it('renders each row as name, duration, then pipe counts', () => {
    const output = formatCombinedSummary([
      makeSummary({ name: 'infra', passed: 2, errors: 1, worstSeverity: 'error', durationMs: 45 }),
    ]);

    expect(output).toContain(`${FAILED_ERROR} infra  45ms  1 error, 2 passed`);
  });

  it('omits zero-count fields from a row', () => {
    const output = formatCombinedSummary([makeSummary({ name: 'deploy', passed: 5, durationMs: 200 })]);

    expect(output).toContain(`${PASSED} deploy  200ms  5 passed`);
    expect(output).not.toContain('|');
  });

  it('includes skip fields in a row when their counts are non-zero', () => {
    const output = formatCombinedSummary([
      makeSummary({ name: 'checks', passed: 1, errors: 1, blocked: 2, optional: 1, worstSeverity: 'error' }),
    ]);

    expect(output).toContain('1 error, 1 passed, 2 blocked, 1 skipped');
  });

  it('retires the prose count grammar', () => {
    const output = formatCombinedSummary([
      makeSummary({ name: 'infra', passed: 2, errors: 1, blocked: 1, worstSeverity: 'error' }),
    ]);

    expect(output).not.toContain('Failed:');
    expect(output).not.toContain('Skipped:');
  });

  describe('total line', () => {
    it('leads with the aggregate worst severity and sums the durations', () => {
      const output = formatCombinedSummary([
        makeSummary({ passed: 10, durationMs: 100 }),
        makeSummary({ name: 'other', passed: 5, errors: 2, blocked: 1, worstSeverity: 'error', durationMs: 200 }),
      ]);

      expect(output.split('\n').at(-1)).toBe(`${FAILED_ERROR} Total: 2 errors, 15 passed, 1 blocked (300ms)`);
    });

    it('leads with the passed token when no checklist failed', () => {
      const output = formatCombinedSummary([
        makeSummary({ passed: 3, durationMs: 50 }),
        makeSummary({ name: 'other', passed: 7, durationMs: 150 }),
      ]);

      expect(output.split('\n').at(-1)).toBe(`${PASSED} Total: 10 passed (200ms)`);
    });

    it('escalates to the worst severity across checklists', () => {
      const output = formatCombinedSummary([
        makeSummary({ name: 'only-recommend', passed: 0, recommendations: 1, worstSeverity: 'recommend' }),
        makeSummary({ name: 'has-warn', passed: 0, warnings: 1, worstSeverity: 'warn' }),
      ]);
      const totalLine = output.split('\n').at(-1);

      expect(totalLine?.startsWith(FAILED_WARN)).toBe(true);
      expect(totalLine).toContain('1 warning, 1 recommendation');
      expect(totalLine).not.toContain('passed');
    });

    it('carries no per-field tokens', () => {
      const output = formatCombinedSummary([makeSummary({ passed: 1, errors: 1, worstSeverity: 'error' })]);
      const totalLine = output.split('\n').at(-1) ?? '';

      expect(totalLine.slice(FAILED_ERROR.length)).not.toContain(PASSED);
    });
  });

  it('left-aligns names and right-aligns durations across rows', () => {
    const lines = renderLines([
      makeSummary({ name: 'ab', durationMs: 5 }),
      makeSummary({ name: 'cdef', durationMs: 1_200 }),
    ]);

    expect(lines[2]).toContain(`${PASSED} ab       5ms`);
    expect(lines[3]).toContain(`${PASSED} cdef  1200ms`);
  });

  it('sizes the rules to the widest line rather than a fixed width', () => {
    const narrow = renderLines([makeSummary({ name: 'a', passed: 1, durationMs: 1 })]);
    const wide = renderLines([makeSummary({ name: 'a-considerably-longer-checklist-name', passed: 1, durationMs: 1 })]);

    expect(wide[1]?.length).toBeGreaterThan(narrow[1]?.length ?? 0);
  });
});
