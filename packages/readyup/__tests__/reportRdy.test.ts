import { describe, expect, it } from 'vitest';

import { emojiFormatter } from '../src/layout/emojiFormatter.ts';
import { countResults, reportRdy, selectVisibleResults } from '../src/reportRdy.ts';
import type { FailedResult, PassedResult, RdyReport, RdyResult, SkippedResult, SummaryCounts } from '../src/types.ts';

const PASSED = emojiFormatter.tokens.passed.glyph;
const FAILED_ERROR = emojiFormatter.tokens.failedError.glyph;
const FAILED_WARN = emojiFormatter.tokens.failedWarn.glyph;
const FAILED_RECOMMEND = emojiFormatter.tokens.failedRecommend.glyph;
const SKIPPED_OPTIONAL = emojiFormatter.tokens.skippedOptional.glyph;
const BLOCKED = emojiFormatter.tokens.blockedPrecondition.glyph;
const FIX = emojiFormatter.tokens.fix.glyph;

/** A duration at or above the engine's floor, so a line that may carry one does. */
const SLOW_MS = 250;

function makePassedResult(overrides?: Partial<PassedResult>): PassedResult {
  return {
    name: 'check',
    status: 'passed',
    ok: true,
    severity: 'error',
    detail: null,
    fix: null,
    error: null,
    progress: null,
    durationMs: 10,
    depth: 0,
    ...overrides,
  };
}

function makeFailedResult(overrides?: Partial<FailedResult>): FailedResult {
  return {
    name: 'check',
    status: 'failed',
    ok: false,
    severity: 'error',
    detail: null,
    fix: null,
    error: null,
    progress: null,
    durationMs: 5,
    depth: 0,
    ...overrides,
  };
}

function makeSkippedResult(overrides?: Partial<SkippedResult>): SkippedResult {
  return {
    name: 'check',
    status: 'skipped',
    ok: null,
    severity: 'error',
    skipReason: 'precondition',
    detail: null,
    fix: null,
    error: null,
    progress: null,
    durationMs: 0,
    depth: 0,
    ...overrides,
  };
}

function makeReport(overrides?: Partial<RdyReport> & { results?: RdyResult[] }): RdyReport {
  return {
    results: [],
    passed: true,
    durationMs: 100,
    ...overrides,
  };
}

/** Return the line that names `needle`, for assertions about a specific check's rendering. */
function lineNaming(output: string, needle: string): string {
  const line = output.split('\n').find((candidate) => candidate.includes(needle));
  if (line === undefined) throw new Error(`No line naming ${JSON.stringify(needle)} in:\n${output}`);
  return line;
}

/** Return the line index that names `needle`. */
function indexNaming(output: string, needle: string): number {
  return output.split('\n').findIndex((candidate) => candidate.includes(needle));
}

describe(reportRdy, () => {
  describe('status tokens', () => {
    it.each([
      ['passed', makePassedResult({ name: 'target' }), PASSED],
      ['error-failed', makeFailedResult({ name: 'target', severity: 'error' }), FAILED_ERROR],
      ['warn-failed', makeFailedResult({ name: 'target', severity: 'warn' }), FAILED_WARN],
      ['recommend-failed', makeFailedResult({ name: 'target', severity: 'recommend' }), FAILED_RECOMMEND],
      ['n/a-skipped', makeSkippedResult({ name: 'target', skipReason: 'n/a' }), SKIPPED_OPTIONAL],
      ['precondition-skipped', makeSkippedResult({ name: 'target', skipReason: 'precondition' }), BLOCKED],
    ])('leads a %s check with its token', (_case, result, token) => {
      const output = reportRdy(makeReport({ results: [result], passed: false }));

      expect(lineNaming(output, 'target')).toBe(`${token} target`);
    });

    it.each(['\u{23ED}', '\u{2705}', '\u{26A0}', '\u{274C}', '\u{2753}', '\u{2796}', '\u{FE0F}'])(
      'renders no %s anywhere in the report',
      (retired) => {
        const output = reportRdy(
          makeReport({
            results: [
              makePassedResult({ name: 'a' }),
              makeFailedResult({ name: 'b', detail: 'why', fix: 'do it' }),
              makeSkippedResult({ name: 'c', skipReason: 'n/a' }),
              makeSkippedResult({ name: 'd', skipReason: 'precondition' }),
            ],
            passed: false,
          }),
        );

        expect(output).not.toContain(retired);
      },
    );
  });

  describe('inline detail', () => {
    it('separates a passed check detail with a middle dot', () => {
      const output = reportRdy(makeReport({ results: [makePassedResult({ name: 'target', detail: 'up to date' })] }));

      expect(lineNaming(output, 'target')).toBe(`${PASSED} target \u{00B7} up to date`);
    });

    it('separates a skip reason with a middle dot', () => {
      const output = reportRdy(
        makeReport({ results: [makeSkippedResult({ name: 'target', skipReason: 'n/a', detail: 'no lockfile' })] }),
      );

      expect(lineNaming(output, 'target')).toBe(`${SKIPPED_OPTIONAL} target \u{00B7} no lockfile`);
    });

    it('brackets progress', () => {
      const output = reportRdy(
        makeReport({
          results: [makePassedResult({ name: 'target', progress: { type: 'fraction', passedCount: 7, count: 10 } })],
        }),
      );

      expect(lineNaming(output, 'target')).toBe(`${PASSED} target [7 of 10]`);
    });

    it('renders percent progress', () => {
      const output = reportRdy(
        makeReport({ results: [makePassedResult({ name: 'target', progress: { type: 'percent', percent: 85 } })] }),
      );

      expect(lineNaming(output, 'target')).toBe(`${PASSED} target [85%]`);
    });

    it('renders detail and progress together with one separator', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({
              name: 'target',
              detail: 'all good',
              progress: { type: 'percent', percent: 100 },
            }),
          ],
        }),
      );

      expect(lineNaming(output, 'target')).toBe(`${PASSED} target \u{00B7} all good [100%]`);
    });

    it('retires the em-dash separator', () => {
      const output = reportRdy(makeReport({ results: [makePassedResult({ name: 'target', detail: 'up to date' })] }));

      expect(output).not.toContain('\u{2014}');
    });
  });

  describe('duration', () => {
    it('omits a duration below the floor', () => {
      const output = reportRdy(makeReport({ results: [makePassedResult({ name: 'target', durationMs: 10 })] }));

      expect(lineNaming(output, 'target')).toBe(`${PASSED} target`);
    });

    it('shows a duration at or above the floor', () => {
      const output = reportRdy(makeReport({ results: [makePassedResult({ name: 'target', durationMs: SLOW_MS })] }));

      expect(lineNaming(output, 'target')).toBe(`${PASSED} target (250ms)`);
    });

    it.each(['n/a', 'precondition'] as const)('omits the duration on a %s-skipped check', (skipReason) => {
      const output = reportRdy(
        makeReport({ results: [makeSkippedResult({ name: 'target', skipReason, durationMs: SLOW_MS })] }),
      );

      expect(lineNaming(output, 'target')).not.toContain('ms');
    });

    it('always shows the total duration on the count line', () => {
      const output = reportRdy(makeReport({ results: [makePassedResult()], durationMs: 4 }));

      expect(output.split('\n').at(-1)).toBe(`${PASSED} 1 passed (4ms)`);
    });
  });

  describe('failure reasons', () => {
    it('leaves the failed line carrying only its claim', () => {
      const output = reportRdy(
        makeReport({ results: [makeFailedResult({ name: 'target', detail: 'lockfile is stale' })], passed: false }),
      );

      expect(lineNaming(output, 'target')).toBe(`${FAILED_ERROR} target`);
    });

    it('renders the authored detail beneath, indented to the name column', () => {
      const output = reportRdy(
        makeReport({ results: [makeFailedResult({ name: 'target', detail: 'lockfile is stale' })], passed: false }),
      );
      const lines = output.split('\n');

      expect(lines[1]).toBe('   lockfile is stale');
    });

    it('renders the authored detail before the labeled exception', () => {
      const output = reportRdy(
        makeReport({
          results: [makeFailedResult({ name: 'target', detail: 'lockfile is stale', error: new Error('ENOENT') })],
          passed: false,
        }),
      );
      const lines = output.split('\n');

      expect(lines[1]).toBe('   lockfile is stale');
      expect(lines[2]).toBe('   Error: ENOENT');
    });

    it('renders an exception alone when no detail was authored', () => {
      const output = reportRdy(
        makeReport({ results: [makeFailedResult({ name: 'target', error: new Error('boom') })], passed: false }),
      );

      expect(output.split('\n', 2)[1]).toBe('   Error: boom');
    });

    it('renders no block for a failure deriving from its children', () => {
      const output = reportRdy(
        makeReport({
          results: [makeFailedResult({ name: 'parent' }), makeFailedResult({ name: 'child', depth: 1 })],
          passed: false,
        }),
      );

      expect(output.split('\n').slice(0, 2)).toStrictEqual([`${FAILED_ERROR} parent`, `   ${FAILED_ERROR} child`]);
    });

    it('indents a nested failure reason to that check\u{2019}s own name column', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'parent' }),
            makePassedResult({ name: 'child', depth: 1 }),
            makeFailedResult({ name: 'grandchild', depth: 2, detail: 'went wrong' }),
          ],
          passed: false,
        }),
      );

      expect(output.split('\n', 4)[3]).toBe('         went wrong');
    });
  });

  describe('count line', () => {
    it('leads with the worst severity rather than the passed count', () => {
      const output = reportRdy(
        makeReport({
          results: [makePassedResult({ name: 'a' }), makeFailedResult({ name: 'b', severity: 'warn' })],
          passed: false,
          durationMs: 142,
        }),
      );

      expect(output.split('\n').at(-1)).toBe(`${FAILED_WARN} 1 passed | 1 warning (142ms)`);
    });

    it('orders the fields by decreasing severity and omits zeros', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'a' }),
            makeFailedResult({ name: 'b', severity: 'error' }),
            makeFailedResult({ name: 'c', severity: 'recommend' }),
            makeSkippedResult({ name: 'd', skipReason: 'precondition' }),
            makeSkippedResult({ name: 'e', skipReason: 'n/a' }),
          ],
          passed: false,
          durationMs: 500,
        }),
      );

      expect(output.split('\n').at(-1)).toBe(
        `${FAILED_ERROR} 1 passed | 1 error | 1 recommendation | 1 blocked | 1 skipped (500ms)`,
      );
    });

    it('counts results pruned from the tree by the reporting threshold', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'shown', severity: 'error' }),
            makePassedResult({ name: 'pruned', severity: 'recommend' }),
          ],
        }),
        { reportOn: 'error' },
      );

      expect(output).not.toContain('pruned');
      expect(output.split('\n').at(-1)).toContain('2 passed');
    });

    it('separates the count line from the tree with a blank line', () => {
      const output = reportRdy(makeReport({ results: [makePassedResult({ name: 'target' })] }));

      expect(output.split('\n', 2)[1]).toBe('');
    });
  });

  describe('fix recap in end mode', () => {
    it('attributes each fix to the check that raised it', () => {
      const output = reportRdy(
        makeReport({ results: [makeFailedResult({ name: 'broken', fix: 'Run pnpm install' })], passed: false }),
      );
      const lines = output.split('\n');
      const heading = indexNaming(output, 'Fixes');

      expect(lines[heading]).toBe('\u{2500}\u{2500} Fixes');
      expect(lines[heading + 2]).toBe(`${FIX} broken`);
      expect(lines[heading + 3]).toBe('   Run pnpm install');
    });

    it('recaps a fix from each failed check', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makeFailedResult({ name: 'first', fix: 'fix one' }),
            makeFailedResult({ name: 'second', fix: 'fix two' }),
          ],
          passed: false,
        }),
      );

      expect(output).toContain(`${FIX} first`);
      expect(output).toContain(`${FIX} second`);
    });

    it('keeps the fix out of the reason block', () => {
      const output = reportRdy(
        makeReport({
          results: [makeFailedResult({ name: 'broken', error: new Error('bad'), fix: 'Update config' })],
          passed: false,
        }),
      );
      const checkLine = indexNaming(output, 'broken');

      expect(output.split('\n')[checkLine + 1]).toBe('   Error: bad');
      expect(output.split('\n')[checkLine + 2]).not.toContain('Update config');
    });

    it('omits the recap when no failed check carries a fix', () => {
      const output = reportRdy(
        makeReport({ results: [makeFailedResult({ name: 'broken', error: new Error('bad') })], passed: false }),
      );

      expect(output).not.toContain('Fixes');
      expect(output).not.toContain(FIX);
    });

    it('recaps a nested check by name', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'parent' }),
            makeFailedResult({ name: 'child', depth: 1, fix: 'fix child' }),
          ],
          passed: false,
        }),
      );

      expect(output).toContain(`${FIX} child`);
      expect(output).toContain('   fix child');
    });

    it('is the default when no options are given', () => {
      const output = reportRdy(
        makeReport({ results: [makeFailedResult({ name: 'broken', fix: 'Fix it' })], passed: false }),
      );

      expect(output).toContain('\u{2500}\u{2500} Fixes');
    });
  });

  describe('fix in inline mode', () => {
    it('joins the fix to the reason block beneath the check', () => {
      const output = reportRdy(
        makeReport({
          results: [makeFailedResult({ name: 'broken', error: new Error('Something went wrong'), fix: 'Run install' })],
          passed: false,
        }),
        { fixLocation: 'inline' },
      );

      expect(output.split('\n').slice(0, 3)).toStrictEqual([
        `${FAILED_ERROR} broken`,
        '   Error: Something went wrong',
        `   ${FIX} Run install`,
      ]);
    });

    it('renders a fix without an exception', () => {
      const output = reportRdy(
        makeReport({ results: [makeFailedResult({ name: 'broken', fix: 'Run install' })], passed: false }),
        { fixLocation: 'inline' },
      );

      expect(output.split('\n', 2)[1]).toBe(`   ${FIX} Run install`);
      expect(output).not.toContain('Error:');
    });

    it('renders an exception without a fix', () => {
      const output = reportRdy(
        makeReport({
          results: [makeFailedResult({ name: 'broken', error: new Error('Missing file') })],
          passed: false,
        }),
        { fixLocation: 'inline' },
      );

      expect(output).toContain('Error: Missing file');
      expect(output).not.toContain(FIX);
    });

    it('adds no end-of-report recap', () => {
      const output = reportRdy(
        makeReport({ results: [makeFailedResult({ name: 'broken', fix: 'Run install' })], passed: false }),
        { fixLocation: 'inline' },
      );

      expect(output).not.toContain('Fixes');
    });

    it('indents a nested fix to that check\u{2019}s own name column', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'parent' }),
            makeFailedResult({ name: 'child', depth: 1, error: new Error('child error'), fix: 'fix child' }),
          ],
          passed: false,
        }),
        { fixLocation: 'inline' },
      );
      const lines = output.split('\n');

      expect(lines[2]).toBe('      Error: child error');
      expect(lines[3]).toBe(`      ${FIX} fix child`);
    });
  });

  describe('nesting', () => {
    it('indents each level by one gutter', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'parent', depth: 0 }),
            makePassedResult({ name: 'child', depth: 1 }),
            makePassedResult({ name: 'grandchild', depth: 2 }),
            makePassedResult({ name: 'great-grandchild', depth: 3 }),
          ],
        }),
      );

      expect(output.split('\n').slice(0, 4)).toStrictEqual([
        `${PASSED} parent`,
        `   ${PASSED} child`,
        `      ${PASSED} grandchild`,
        `         ${PASSED} great-grandchild`,
      ]);
    });

    it('renders every result it is given, applying no suppression of its own', () => {
      // `runRdy` no longer emits descendants of an n/a result, so the renderer must not
      // second-guess its input: whatever arrives is displayed and counted.
      const output = reportRdy(
        makeReport({
          results: [
            makeSkippedResult({ name: 'na-check', skipReason: 'n/a', depth: 1 }),
            makeSkippedResult({ name: 'deeper', skipReason: 'precondition', depth: 2 }),
            makePassedResult({ name: 'sibling', depth: 1 }),
          ],
        }),
      );

      expect(output).toContain('na-check');
      expect(output).toContain('deeper');
      expect(output).toContain('sibling');
      expect(output.split('\n').at(-1)).toContain('1 blocked');
    });

    it('includes nested results in the counts', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'parent', depth: 0 }),
            makePassedResult({ name: 'child', depth: 1 }),
            makeFailedResult({ name: 'child-fail', depth: 1 }),
          ],
          passed: false,
          durationMs: 50,
        }),
      );

      expect(output.split('\n').at(-1)).toBe(`${FAILED_ERROR} 2 passed | 1 error (50ms)`);
    });
  });

  describe('reporting threshold', () => {
    it('excludes results below the reporting threshold', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makeFailedResult({ name: 'error-check', severity: 'error' }),
            makeFailedResult({ name: 'recommend-check', severity: 'recommend' }),
          ],
          passed: false,
        }),
        { reportOn: 'error' },
      );

      expect(output).toContain('error-check');
      expect(output).not.toContain('recommend-check');
    });

    it('reports a below-threshold failure in the counts and worst severity', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makePassedResult({ name: 'error-pass', severity: 'error' }),
            makeFailedResult({ name: 'warn-fail', severity: 'warn' }),
          ],
          passed: false,
        }),
        { reportOn: 'error' },
      );

      expect(output.split('\n').at(-1)).toContain(`${FAILED_WARN} 1 passed | 1 warning`);
      expect(output).not.toContain('warn-fail');
    });

    it('hides a precondition result whose severity is below the threshold', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makeSkippedResult({ name: 'precond', severity: 'recommend', skipReason: 'precondition' }),
            makeFailedResult({ name: 'error-check', severity: 'error' }),
          ],
          passed: false,
        }),
        { reportOn: 'error' },
      );

      expect(output).toContain('error-check');
      expect(output).not.toContain('precond');
    });

    it('shows only skipped dependents whose severity meets the threshold', () => {
      const output = reportRdy(
        makeReport({
          results: [
            makeSkippedResult({ name: 'high-sev-dep', severity: 'error', skipReason: 'precondition' }),
            makeSkippedResult({ name: 'low-sev-dep', severity: 'recommend', skipReason: 'precondition' }),
          ],
        }),
        { reportOn: 'warn' },
      );

      expect(output).toContain('high-sev-dep');
      expect(output).not.toContain('low-sev-dep');
    });

    it('defaults reportOn to recommend, showing everything', () => {
      const output = reportRdy(
        makeReport({ results: [makePassedResult({ name: 'recommend-check', severity: 'recommend' })] }),
      );

      expect(output).toContain('recommend-check');
    });
  });
});

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
