import { describe, expect, it } from 'vitest';

import { formatCombinedSummary } from '../src/formatCombinedSummary.ts';
import type { ChecklistSummary } from '../src/types.ts';

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

describe(formatCombinedSummary, () => {
  it('renders the summary header and footer lines', () => {
    const output = formatCombinedSummary([makeSummary()]);

    expect(output).toContain('── Summary');
    expect(output.split('\n').at(-2)).toMatch(/^─+$/);
  });

  it('shows 🟢 prefix when worstSeverity is null', () => {
    const output = formatCombinedSummary([makeSummary({ name: 'deploy' })]);

    expect(output).toContain('🟢 deploy');
  });

  it('shows 🔴 prefix when worstSeverity is error', () => {
    const output = formatCombinedSummary([makeSummary({ name: 'deploy', errors: 1, worstSeverity: 'error' })]);

    expect(output).toContain('🔴 deploy');
  });

  it('shows 🟠 prefix when worstSeverity is warn', () => {
    const output = formatCombinedSummary([makeSummary({ name: 'deploy', warnings: 1, worstSeverity: 'warn' })]);

    expect(output).toContain('🟠 deploy');
  });

  it('shows 🟡 prefix when worstSeverity is recommend', () => {
    const output = formatCombinedSummary([
      makeSummary({ name: 'deploy', recommendations: 1, worstSeverity: 'recommend' }),
    ]);

    expect(output).toContain('🟡 deploy');
  });

  it('includes duration and grouped counts in each row', () => {
    const output = formatCombinedSummary([
      makeSummary({ name: 'infra', passed: 2, errors: 1, worstSeverity: 'error', durationMs: 45 }),
    ]);

    expect(output).toContain('🔴 infra  45ms  2 passed. Failed: 1 error');
    expect(output).not.toContain('Skipped:');
  });

  it('omits zero-count categories from row', () => {
    const output = formatCombinedSummary([makeSummary({ name: 'deploy', passed: 5, durationMs: 200 })]);

    expect(output).toContain('🟢 deploy  200ms  5 passed');
    expect(output).not.toContain('Failed:');
    expect(output).not.toContain('Skipped:');
  });

  it('renders the Total line with icon-prefixed grouped counts and total duration', () => {
    const output = formatCombinedSummary([
      makeSummary({ passed: 10, durationMs: 100 }),
      makeSummary({
        name: 'other',
        passed: 5,
        errors: 2,
        blocked: 1,
        worstSeverity: 'error',
        durationMs: 200,
      }),
    ]);

    expect(output).toContain('Total: 🟢 15 passed. Failed: 🔴 2 errors. Skipped: ⛔ 1 blocked (300ms)');
  });

  it('omits zero-count groups from the Total line', () => {
    const output = formatCombinedSummary([
      makeSummary({ passed: 3, durationMs: 50 }),
      makeSummary({ name: 'other', passed: 7, durationMs: 150 }),
    ]);

    expect(output).toContain('Total: 🟢 10 passed (200ms)');
    expect(output).not.toContain('Failed:');
    expect(output).not.toContain('Skipped:');
  });

  it('right-aligns durations and left-aligns names across rows', () => {
    const output = formatCombinedSummary([
      makeSummary({ name: 'ab', durationMs: 5 }),
      makeSummary({ name: 'cdef', durationMs: 1200 }),
    ]);

    const rows = output.split('\n').filter((l) => l.includes('passed'));
    // "ab" padded to length of "cdef", "5ms" padded to length of "1200ms"
    expect(rows[0]).toContain('🟢 ab       5ms');
    expect(rows[1]).toContain('🟢 cdef  1200ms');
  });

  it('includes skip groups in row when counts are non-zero', () => {
    const output = formatCombinedSummary([
      makeSummary({
        name: 'checks',
        passed: 1,
        errors: 1,
        blocked: 2,
        worstSeverity: 'error',
        durationMs: 80,
      }),
    ]);

    expect(output).toContain('1 passed. Failed: 1 error. Skipped: 2 blocked');
  });

  it('renders per-row icons reflecting each checklist worst severity', () => {
    const output = formatCombinedSummary([
      makeSummary({ name: 'only-recommend', recommendations: 1, worstSeverity: 'recommend', durationMs: 10 }),
      makeSummary({ name: 'has-warn', warnings: 1, worstSeverity: 'warn', durationMs: 10 }),
    ]);

    // Per-checklist rows get worst-severity icons; the Total row itself is always
    // prefixed with "Total:" and uses per-category icons from `formatSummaryCounts`.
    expect(output).toContain('🟡 only-recommend');
    expect(output).toContain('🟠 has-warn');
  });

  it('aggregates mixed-severity checklists into a single Total line with per-category icons', () => {
    const output = formatCombinedSummary([
      makeSummary({
        name: 'only-recommend',
        passed: 0,
        recommendations: 1,
        worstSeverity: 'recommend',
        durationMs: 10,
      }),
      makeSummary({ name: 'has-warn', passed: 0, warnings: 1, worstSeverity: 'warn', durationMs: 10 }),
    ]);

    const totalLine = output.split('\n').find((l) => l.startsWith('Total:'));
    expect(totalLine).toBeDefined();
    // Both failure categories are summed with their own per-category icons.
    expect(totalLine).toContain('Failed: 🟠 1 warning, 🟡 1 recommendation');
    expect(totalLine).toContain('(20ms)');
    expect(totalLine).not.toContain('passed');
  });
});
