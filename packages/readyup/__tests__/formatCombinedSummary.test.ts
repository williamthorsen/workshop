import { describe, expect, it } from 'vitest';

import { formatCombinedSummary } from '../src/formatCombinedSummary.ts';
import type { ChecklistSummary } from '../src/types.ts';

function makeSummary(overrides?: Partial<ChecklistSummary>): ChecklistSummary {
  return {
    name: 'test-checklist',
    passed: 3,
    failed: 0,
    skipped: 0,
    allPassed: true,
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

  it('shows 🟢 prefix for a passing checklist', () => {
    const output = formatCombinedSummary([makeSummary({ name: 'deploy' })]);

    expect(output).toContain('🟢 deploy');
  });

  it('shows 🔴 prefix for a failing checklist', () => {
    const output = formatCombinedSummary([makeSummary({ name: 'deploy', failed: 1, allPassed: false })]);

    expect(output).toContain('🔴 deploy');
  });

  it('includes duration and non-zero counts in each row', () => {
    const output = formatCombinedSummary([
      makeSummary({ name: 'infra', passed: 2, failed: 1, skipped: 0, allPassed: false, durationMs: 45 }),
    ]);

    expect(output).toContain('🔴 infra  45ms  2 passed, 1 failed');
    expect(output).not.toContain('skipped');
  });

  it('omits zero counts from row', () => {
    const output = formatCombinedSummary([
      makeSummary({ name: 'deploy', passed: 5, failed: 0, skipped: 0, durationMs: 200 }),
    ]);

    expect(output).toContain('🟢 deploy  200ms  5 passed');
    expect(output).not.toContain('failed');
  });

  it('renders the Total line with icon-prefixed counts and total duration', () => {
    const output = formatCombinedSummary([
      makeSummary({ passed: 10, failed: 0, skipped: 0, durationMs: 100 }),
      makeSummary({ name: 'other', passed: 5, failed: 2, skipped: 1, allPassed: false, durationMs: 200 }),
    ]);

    expect(output).toContain('Total: 🟢 15 passed, 🔴 2 failed, ⛔ 1 skipped (300ms)');
  });

  it('omits zero counts from the Total line', () => {
    const output = formatCombinedSummary([
      makeSummary({ passed: 3, failed: 0, skipped: 0, durationMs: 50 }),
      makeSummary({ name: 'other', passed: 7, failed: 0, skipped: 0, durationMs: 150 }),
    ]);

    expect(output).toContain('Total: 🟢 10 passed (200ms)');
    expect(output).not.toContain('failed');
    expect(output).not.toContain('skipped');
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

  it('includes skipped in row when non-zero', () => {
    const output = formatCombinedSummary([
      makeSummary({ name: 'checks', passed: 1, failed: 1, skipped: 2, allPassed: false, durationMs: 80 }),
    ]);

    expect(output).toContain('1 passed, 1 failed, 2 skipped');
  });
});
