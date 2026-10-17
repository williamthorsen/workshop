import { describe, expect, it } from 'vitest';

import type { SummaryCounts } from '../../kits/types.ts';
import { countResults, selectVisibleResults } from '../reportRdy.ts';
import { makeFailedResult, makePassedResult, makeSkippedResult } from '../test-utils/result-fixtures.ts';

describe(countResults, () => {
  it('returns zeroed counts for an empty result list', () => {
    const counts = countResults([]);

    expect(counts).toStrictEqual(makeCounts());
  });

  it('increments `passed` for a passed result', () => {
    const counts = countResults([makePassedResult()]);

    expect(counts.passed).toBe(1);
    expect(counts.worstSeverity).toBeNull();
  });

  it('leaves `worstSeverity` null after a passing result', () => {
    const counts = countResults([makePassedResult(), makePassedResult()]);

    expect(counts.worstSeverity).toBeNull();
  });

  it('increments `errors` and sets worstSeverity to error for a failed error result', () => {
    const counts = countResults([makeFailedResult({ severity: 'error' })]);

    expect(counts.errors).toBe(1);
    expect(counts.warnings).toBe(0);
    expect(counts.recommendations).toBe(0);
    expect(counts.worstSeverity).toBe('error');
  });

  it('increments `warnings` and sets worstSeverity to warn for a failed warn result', () => {
    const counts = countResults([makeFailedResult({ severity: 'warn' })]);

    expect(counts.warnings).toBe(1);
    expect(counts.errors).toBe(0);
    expect(counts.recommendations).toBe(0);
    expect(counts.worstSeverity).toBe('warn');
  });

  it('increments `recommendations` and sets worstSeverity to recommend for a failed recommend result', () => {
    const counts = countResults([makeFailedResult({ severity: 'recommend' })]);

    expect(counts.recommendations).toBe(1);
    expect(counts.errors).toBe(0);
    expect(counts.warnings).toBe(0);
    expect(counts.worstSeverity).toBe('recommend');
  });

  it('increments `blocked` for a precondition-skipped result', () => {
    const counts = countResults([makeSkippedResult({ skipReason: 'precondition' })]);

    expect(counts.blocked).toBe(1);
    expect(counts.optional).toBe(0);
    expect(counts.worstSeverity).toBeNull();
  });

  it('increments `optional` for an n/a-skipped result', () => {
    const counts = countResults([makeSkippedResult({ skipReason: 'n/a' })]);

    expect(counts.optional).toBe(1);
    expect(counts.blocked).toBe(0);
    expect(counts.worstSeverity).toBeNull();
  });

  it('escalates worstSeverity from recommend to warn', () => {
    const counts = countResults([makeFailedResult({ severity: 'recommend' }), makeFailedResult({ severity: 'warn' })]);

    expect(counts.worstSeverity).toBe('warn');
  });

  it('escalates worstSeverity from warn to error', () => {
    const counts = countResults([makeFailedResult({ severity: 'warn' }), makeFailedResult({ severity: 'error' })]);

    expect(counts.worstSeverity).toBe('error');
  });

  it('does not de-escalate worstSeverity when a lower-severity failure follows a higher one', () => {
    const twoFailures = countResults([makeFailedResult({ severity: 'error' }), makeFailedResult({ severity: 'warn' })]);

    expect(twoFailures.worstSeverity).toBe('error');

    const threeFailures = countResults([
      makeFailedResult({ severity: 'error' }),
      makeFailedResult({ severity: 'warn' }),
      makeFailedResult({ severity: 'recommend' }),
    ]);

    expect(threeFailures.worstSeverity).toBe('error');
  });

  it('does not de-escalate worstSeverity from warn when a recommend failure follows', () => {
    const counts = countResults([makeFailedResult({ severity: 'warn' }), makeFailedResult({ severity: 'recommend' })]);

    expect(counts.worstSeverity).toBe('warn');
  });

  it('does not change worstSeverity when a passed result follows a failure', () => {
    const counts = countResults([makeFailedResult({ severity: 'warn' }), makePassedResult()]);

    expect(counts.worstSeverity).toBe('warn');
    expect(counts.passed).toBe(1);
    expect(counts.warnings).toBe(1);
  });

  it('does not change worstSeverity when a skipped result follows a failure', () => {
    const counts = countResults([
      makeFailedResult({ severity: 'error' }),
      makeSkippedResult({ skipReason: 'precondition' }),
      makeSkippedResult({ skipReason: 'n/a' }),
    ]);

    expect(counts.worstSeverity).toBe('error');
    expect(counts.blocked).toBe(1);
    expect(counts.optional).toBe(1);
  });
});

describe(selectVisibleResults, () => {
  it('returns an empty list when given no results', () => {
    expect(selectVisibleResults([], 'error')).toStrictEqual([]);
  });

  it('keeps a below-threshold parent when a descendant meets the threshold', () => {
    const visible = selectVisibleResults(
      [
        makePassedResult({ name: 'parent', severity: 'recommend', depth: 0 }),
        makeFailedResult({ name: 'child', severity: 'error', depth: 1 }),
      ],
      'error',
    );

    expect(visible.map((r) => r.name)).toStrictEqual(['parent', 'child']);
  });

  it('prunes a below-threshold parent when no descendant meets the threshold', () => {
    const visible = selectVisibleResults(
      [
        makePassedResult({ name: 'parent', severity: 'recommend', depth: 0 }),
        makeFailedResult({ name: 'child', severity: 'warn', depth: 1 }),
      ],
      'error',
    );

    expect(visible).toStrictEqual([]);
  });

  it('keeps an entire ancestor chain for a single deep survivor', () => {
    const visible = selectVisibleResults(
      [
        makePassedResult({ name: 'a', severity: 'recommend', depth: 0 }),
        makePassedResult({ name: 'b', severity: 'recommend', depth: 1 }),
        makeFailedResult({ name: 'c', severity: 'error', depth: 2 }),
      ],
      'error',
    );

    expect(visible.map((r) => r.name)).toStrictEqual(['a', 'b', 'c']);
  });

  it('keeps only the sibling subtree containing a survivor', () => {
    const visible = selectVisibleResults(
      [
        makePassedResult({ name: 'first', severity: 'recommend', depth: 0 }),
        makeFailedResult({ name: 'first-child', severity: 'warn', depth: 1 }),
        makePassedResult({ name: 'second', severity: 'recommend', depth: 0 }),
        makeFailedResult({ name: 'second-child', severity: 'error', depth: 1 }),
      ],
      'error',
    );

    expect(visible.map((r) => r.name)).toStrictEqual(['second', 'second-child']);
  });

  it('does not retain a pruned subtree because a later top-level result survives', () => {
    const visible = selectVisibleResults(
      [
        makePassedResult({ name: 'pruned', severity: 'recommend', depth: 0 }),
        makePassedResult({ name: 'pruned-child', severity: 'recommend', depth: 1 }),
        makeFailedResult({ name: 'later', severity: 'error', depth: 0 }),
      ],
      'error',
    );

    expect(visible.map((r) => r.name)).toStrictEqual(['later']);
  });

  it('leaves the caller\u{2019}s list unmodified', () => {
    const results = [
      makePassedResult({ name: 'parent', severity: 'recommend', depth: 0 }),
      makeFailedResult({ name: 'child', severity: 'error', depth: 1 }),
    ];

    selectVisibleResults(results, 'error');

    expect(results.map((r) => r.name)).toStrictEqual(['parent', 'child']);
  });
});

// region | Helpers

/** Builds an all-zero tally with any field overridden. */
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

// endregion | Helpers
