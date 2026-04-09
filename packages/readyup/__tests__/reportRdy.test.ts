import { describe, expect, it } from 'vitest';

import { formatSummaryCounts, reportRdy } from '../src/reportRdy.ts';
import type { FailedResult, PassedResult, RdyReport, RdyResult, SkippedResult, SummaryCounts } from '../src/types.ts';

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

describe(reportRdy, () => {
  it('shows passed checks with green circle icon', () => {
    const report = makeReport({
      results: [makePassedResult({ name: 'check-a', durationMs: 10 })],
    });

    const output = reportRdy(report);

    expect(output).toContain('\u{1F7E2} check-a (10ms)');
  });

  it('shows error-failed checks with red circle icon', () => {
    const report = makeReport({
      results: [makeFailedResult({ name: 'check-b', severity: 'error' })],
      passed: false,
    });

    const output = reportRdy(report);

    expect(output).toContain('\u{1F534} check-b (5ms)');
  });

  it('shows warn-failed checks with orange circle icon', () => {
    const report = makeReport({
      results: [makeFailedResult({ name: 'check-warn', severity: 'warn' })],
      passed: false,
    });

    const output = reportRdy(report);

    expect(output).toContain('\u{1F7E0} check-warn (5ms)');
  });

  it('shows recommend-failed checks with yellow circle icon', () => {
    const report = makeReport({
      results: [makeFailedResult({ name: 'check-rec', severity: 'recommend' })],
      passed: false,
    });

    const output = reportRdy(report);

    expect(output).toContain('\u{1F7E1} check-rec (5ms)');
  });

  it('shows n/a-skipped checks with white circle icon', () => {
    const report = makeReport({
      results: [makeSkippedResult({ name: 'check-na', skipReason: 'n/a' })],
    });

    const output = reportRdy(report);

    expect(output).toContain('\u26AA check-na (0ms)');
  });

  it('shows precondition-skipped checks with no-entry icon', () => {
    const report = makeReport({
      results: [makeSkippedResult({ name: 'check-pre', skipReason: 'precondition' })],
    });

    const output = reportRdy(report);

    expect(output).toContain('\u26D4 check-pre (0ms)');
  });

  it('renders the summary line with granular failure and skip groups', () => {
    const report = makeReport({
      results: [
        makePassedResult({ name: 'a', durationMs: 10 }),
        makeFailedResult({ name: 'b', durationMs: 20 }),
        makeSkippedResult({ name: 'c' }),
      ],
      passed: false,
      durationMs: 142,
    });

    const output = reportRdy(report);

    expect(output).toContain('\u{1F7E2} 1 passed. Failed: \u{1F534} 1 error. Skipped: \u26D4 1 blocked (142ms)');
  });

  it('omits zero counts from the summary line', () => {
    const report = makeReport({
      results: [makePassedResult({ name: 'a', durationMs: 10 }), makePassedResult({ name: 'b', durationMs: 15 })],
      durationMs: 25,
    });

    const output = reportRdy(report);

    expect(output).toContain('\u{1F7E2} 2 passed (25ms)');
    expect(output).not.toContain('failed');
    expect(output).not.toContain('skipped');
  });

  describe('inline mode', () => {
    it('shows error and fix below failed check', () => {
      const report = makeReport({
        results: [
          makeFailedResult({
            name: 'broken',
            error: new Error('Something went wrong'),
            fix: 'Run npm install',
          }),
        ],
        passed: false,
      });

      const output = reportRdy(report, { fixLocation: 'inline' });
      const lines = output.split('\n');

      expect(output).toContain('Error: Something went wrong');
      expect(output).toContain('\u{1F48A} Fix: Run npm install');

      const checkLineIndex = lines.findIndex((l) => l.includes('broken'));
      const errorLineIndex = lines.findIndex((l) => l.includes('Error: Something went wrong'));
      expect(errorLineIndex).toBe(checkLineIndex + 1);
    });

    it('shows fix without error when error is null', () => {
      const report = makeReport({
        results: [makeFailedResult({ name: 'broken', fix: 'Run npm install' })],
        passed: false,
      });

      const output = reportRdy(report, { fixLocation: 'inline' });

      expect(output).toContain('\u{1F48A} Fix: Run npm install');
      expect(output).not.toContain('Error:');
    });

    it('shows error without fix when fix is null', () => {
      const report = makeReport({
        results: [makeFailedResult({ name: 'broken', error: new Error('Missing file') })],
        passed: false,
      });

      const output = reportRdy(report, { fixLocation: 'inline' });

      expect(output).toContain('Error: Missing file');
      expect(output).not.toContain('\u{1F48A}');
    });
  });

  describe('end mode', () => {
    it('shows error inline and collects fixes at the bottom', () => {
      const report = makeReport({
        results: [
          makeFailedResult({
            name: 'broken',
            error: new Error('Bad config'),
            fix: 'Update config file',
          }),
        ],
        passed: false,
      });

      const output = reportRdy(report, { fixLocation: 'end' });

      const lines = output.split('\n');
      const errorLineIndex = lines.findIndex((l) => l.includes('Error: Bad config'));
      const checkLineIndex = lines.findIndex((l) => l.includes('broken'));
      expect(errorLineIndex).toBe(checkLineIndex + 1);

      expect(output).toContain('Fixes:');
      expect(output).toContain(`  \u{1F48A} Update config file`);
    });

    it('omits Fixes section when no fixes are present', () => {
      const report = makeReport({
        results: [makeFailedResult({ name: 'broken', error: new Error('Unknown error') })],
        passed: false,
      });

      const output = reportRdy(report, { fixLocation: 'end' });

      expect(output).toContain('Error: Unknown error');
      expect(output).not.toContain('Fixes:');
    });
  });

  describe('detail and progress rendering', () => {
    it('renders detail inline after duration', () => {
      const report = makeReport({
        results: [makePassedResult({ name: 'check-a', durationMs: 10, detail: 'some info' })],
      });

      const output = reportRdy(report);

      expect(output).toContain('\u{1F7E2} check-a (10ms) \u2014 some info');
    });

    it('renders fraction progress', () => {
      const report = makeReport({
        results: [
          makeFailedResult({
            name: 'check-b',
            progress: { type: 'fraction', passedCount: 7, count: 10 },
          }),
        ],
        passed: false,
      });

      const output = reportRdy(report);

      expect(output).toContain('\u{1F534} check-b (5ms) \u2014 7 of 10');
    });

    it('renders percent progress', () => {
      const report = makeReport({
        results: [makeFailedResult({ name: 'check-c', durationMs: 3, progress: { type: 'percent', percent: 85 } })],
        passed: false,
      });

      const output = reportRdy(report);

      expect(output).toContain('\u{1F534} check-c (3ms) \u2014 85%');
    });

    it('renders both detail and progress as separate segments', () => {
      const report = makeReport({
        results: [
          makeFailedResult({
            name: 'check-d',
            detail: 'some detail',
            progress: { type: 'fraction', passedCount: 7, count: 10 },
          }),
        ],
        passed: false,
      });

      const output = reportRdy(report);

      expect(output).toContain('\u{1F534} check-d (5ms) \u2014 some detail \u2014 7 of 10');
    });

    it('renders detail and progress on passing checks', () => {
      const report = makeReport({
        results: [
          makePassedResult({
            name: 'check-e',
            durationMs: 2,
            detail: 'all good',
            progress: { type: 'percent', percent: 100 },
          }),
        ],
      });

      const output = reportRdy(report);

      expect(output).toContain('\u{1F7E2} check-e (2ms) \u2014 all good \u2014 100%');
    });

    it('omits detail segment when detail is null', () => {
      const report = makeReport({
        results: [makePassedResult({ name: 'check-f', durationMs: 1 })],
      });

      const output = reportRdy(report);

      expect(output).toContain('\u{1F7E2} check-f (1ms)');
      expect(output).not.toContain('\u2014');
    });
  });

  it('defaults to end mode when no options are provided', () => {
    const report = makeReport({
      results: [
        makeFailedResult({
          name: 'broken',
          error: new Error('Oops'),
          fix: 'Fix it',
        }),
      ],
      passed: false,
    });

    const output = reportRdy(report);

    expect(output).toContain('Fixes:');
    expect(output).toContain(`  \u{1F48A} Fix it`);
    expect(output).not.toContain('Fix: Fix it');
  });

  describe('nested checks', () => {
    it('indents nested results by depth', () => {
      const report = makeReport({
        results: [
          makePassedResult({ name: 'parent', depth: 0, durationMs: 10 }),
          makePassedResult({ name: 'child', depth: 1, durationMs: 5 }),
          makePassedResult({ name: 'grandchild', depth: 2, durationMs: 3 }),
        ],
      });

      const output = reportRdy(report);
      const lines = output.split('\n');

      expect(lines[0]).toBe('\u{1F7E2} parent (10ms)');
      expect(lines[1]).toBe('  \u{1F7E2} child (5ms)');
      expect(lines[2]).toBe('    \u{1F7E2} grandchild (3ms)');
    });

    it('renders top-level result at depth 0 with no indentation', () => {
      const report = makeReport({
        results: [makePassedResult({ name: 'top-check', depth: 0, durationMs: 7 })],
      });

      const output = reportRdy(report);
      const lines = output.split('\n');

      expect(lines[0]).toBe('\u{1F7E2} top-check (7ms)');
    });

    it('shows n/a parent but suppresses descendants', () => {
      const report = makeReport({
        results: [
          makeSkippedResult({ name: 'na-parent', skipReason: 'n/a', depth: 0 }),
          makeSkippedResult({ name: 'na-child', skipReason: 'n/a', depth: 1 }),
          makePassedResult({ name: 'next-sibling', depth: 0, durationMs: 10 }),
        ],
      });

      const output = reportRdy(report);

      expect(output).toContain('na-parent');
      expect(output).not.toContain('na-child');
      expect(output).toContain('next-sibling');
    });

    it('indents inline detail lines at parent depth', () => {
      const report = makeReport({
        results: [
          makePassedResult({ name: 'parent', depth: 0 }),
          makeFailedResult({
            name: 'child',
            depth: 1,
            error: new Error('child error'),
            fix: 'fix child',
          }),
        ],
        passed: false,
      });

      const output = reportRdy(report, { fixLocation: 'inline' });
      const lines = output.split('\n');

      const childLine = lines.findIndex((l) => l.includes('child'));
      expect(lines[childLine]).toMatch(/^ {2}/);
      expect(lines[childLine + 1]).toBe('    Error: child error');
      expect(lines[childLine + 2]).toBe('    \u{1F48A} Fix: fix child');
    });

    it('collects fixes from nested failed checks in end mode', () => {
      const report = makeReport({
        results: [
          makePassedResult({ name: 'parent', depth: 0 }),
          makeFailedResult({
            name: 'child',
            depth: 1,
            error: new Error('child error'),
            fix: 'fix the child',
          }),
        ],
        passed: false,
      });

      const output = reportRdy(report, { fixLocation: 'end' });
      const lines = output.split('\n');

      const childLine = lines.findIndex((l) => l.includes('child'));
      expect(lines[childLine + 1]).toBe('    Error: child error');
      expect(output).toContain('Fixes:');
      expect(output).toContain(`  \u{1F48A} fix the child`);
      // Fix should not appear inline after the error line.
      expect(lines[childLine + 2]).not.toContain('fix the child');
    });

    it('includes nested results in summary counts', () => {
      const report = makeReport({
        results: [
          makePassedResult({ name: 'parent', depth: 0 }),
          makePassedResult({ name: 'child', depth: 1 }),
          makeFailedResult({ name: 'child-fail', depth: 1 }),
        ],
        passed: false,
        durationMs: 50,
      });

      const output = reportRdy(report);

      expect(output).toContain('\u{1F7E2} 2 passed. Failed: \u{1F534} 1 error');
    });

    it('counts n/a parent as optional skip and excludes suppressed descendants from summary', () => {
      const report = makeReport({
        results: [
          makeSkippedResult({ name: 'na-parent', skipReason: 'n/a', depth: 0 }),
          makeSkippedResult({ name: 'na-child', skipReason: 'n/a', depth: 1 }),
          makePassedResult({ name: 'sibling', depth: 0, durationMs: 10 }),
        ],
        durationMs: 50,
      });

      const output = reportRdy(report);

      // na-parent counts as optional skip; na-child is suppressed; sibling counts as passed.
      expect(output).toContain('\u{1F7E2} 1 passed');
      expect(output).toContain('\u26AA 1 optional');
      expect(output).toContain('na-parent');
      expect(output).not.toContain('na-child');
    });

    it('resumes output after n/a subtree at same depth', () => {
      const report = makeReport({
        results: [
          makeSkippedResult({ name: 'na-check', skipReason: 'n/a', depth: 1 }),
          makeSkippedResult({ name: 'na-child', skipReason: 'n/a', depth: 2 }),
          makePassedResult({ name: 'sibling', depth: 1, durationMs: 5 }),
        ],
      });

      const output = reportRdy(report);

      expect(output).toContain('na-check');
      expect(output).not.toContain('na-child');
      expect(output).toContain('sibling');
    });
  });

  describe('reporting threshold', () => {
    it('excludes results below the reporting threshold', () => {
      const report = makeReport({
        results: [
          makeFailedResult({ name: 'error-check', severity: 'error' }),
          makeFailedResult({ name: 'recommend-check', severity: 'recommend' }),
        ],
        passed: false,
      });

      const output = reportRdy(report, { reportOn: 'error' });

      expect(output).toContain('error-check');
      expect(output).not.toContain('recommend-check');
    });

    it('counts only visible results in the summary', () => {
      const report = makeReport({
        results: [
          makePassedResult({ name: 'error-pass', severity: 'error' }),
          makePassedResult({ name: 'recommend-pass', severity: 'recommend' }),
        ],
      });

      const output = reportRdy(report, { reportOn: 'error' });

      expect(output).toContain('\u{1F7E2} 1 passed');
      expect(output).not.toContain('2 passed');
    });

    it('hides precondition result when its severity is below the reporting threshold', () => {
      const report = makeReport({
        results: [
          makeSkippedResult({ name: 'precond', severity: 'recommend', skipReason: 'precondition' }),
          makeFailedResult({ name: 'error-check', severity: 'error' }),
        ],
        passed: false,
      });

      const output = reportRdy(report, { reportOn: 'error' });

      expect(output).toContain('error-check');
      expect(output).not.toContain('precond');
    });

    it('shows only skipped dependents whose severity meets the reporting threshold', () => {
      const report = makeReport({
        results: [
          makeSkippedResult({ name: 'high-sev-dep', severity: 'error', skipReason: 'precondition' }),
          makeSkippedResult({ name: 'low-sev-dep', severity: 'recommend', skipReason: 'precondition' }),
        ],
      });

      const output = reportRdy(report, { reportOn: 'warn' });

      expect(output).toContain('high-sev-dep');
      expect(output).not.toContain('low-sev-dep');
    });

    it('defaults reportOn to recommend (show all)', () => {
      const report = makeReport({
        results: [makePassedResult({ name: 'recommend-check', severity: 'recommend' })],
      });

      const output = reportRdy(report);

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

describe(formatSummaryCounts, () => {
  it('includes all non-zero counts with icons across all three groups', () => {
    const counts = makeCounts({
      passed: 14,
      errors: 1,
      warnings: 1,
      recommendations: 2,
      blocked: 5,
      optional: 2,
      worstSeverity: 'error',
    });

    expect(formatSummaryCounts(counts)).toBe(
      '\u{1F7E2} 14 passed. Failed: \u{1F534} 1 error, \u{1F7E0} 1 warning, \u{1F7E1} 2 recommendations. Skipped: \u26D4 5 blocked, \u26AA 2 optional',
    );
  });

  it('pluralizes errors correctly for counts of 1 and 2', () => {
    expect(formatSummaryCounts(makeCounts({ errors: 1, worstSeverity: 'error' }))).toBe('Failed: \u{1F534} 1 error');
    expect(formatSummaryCounts(makeCounts({ errors: 2, worstSeverity: 'error' }))).toBe('Failed: \u{1F534} 2 errors');
  });

  it('pluralizes warnings correctly for counts of 1 and 2', () => {
    expect(formatSummaryCounts(makeCounts({ warnings: 1, worstSeverity: 'warn' }))).toBe('Failed: \u{1F7E0} 1 warning');
    expect(formatSummaryCounts(makeCounts({ warnings: 2, worstSeverity: 'warn' }))).toBe(
      'Failed: \u{1F7E0} 2 warnings',
    );
  });

  it('pluralizes recommendations correctly for counts of 1 and 2', () => {
    expect(formatSummaryCounts(makeCounts({ recommendations: 1, worstSeverity: 'recommend' }))).toBe(
      'Failed: \u{1F7E1} 1 recommendation',
    );
    expect(formatSummaryCounts(makeCounts({ recommendations: 2, worstSeverity: 'recommend' }))).toBe(
      'Failed: \u{1F7E1} 2 recommendations',
    );
  });

  it('keeps `blocked` and `optional` labels unchanged for any count', () => {
    expect(formatSummaryCounts(makeCounts({ blocked: 1, optional: 1 }))).toBe(
      'Skipped: \u26D4 1 blocked, \u26AA 1 optional',
    );
    expect(formatSummaryCounts(makeCounts({ blocked: 3, optional: 4 }))).toBe(
      'Skipped: \u26D4 3 blocked, \u26AA 4 optional',
    );
  });

  it('omits the Failed group when no failure categories have counts', () => {
    expect(formatSummaryCounts(makeCounts({ passed: 5 }))).toBe('\u{1F7E2} 5 passed');
  });

  it('omits the Skipped group when no skip categories have counts', () => {
    expect(formatSummaryCounts(makeCounts({ passed: 5, errors: 1, worstSeverity: 'error' }))).toBe(
      '\u{1F7E2} 5 passed. Failed: \u{1F534} 1 error',
    );
  });

  it('omits zero-count categories within an otherwise non-empty group', () => {
    expect(formatSummaryCounts(makeCounts({ errors: 2, recommendations: 1, worstSeverity: 'error' }))).toBe(
      'Failed: \u{1F534} 2 errors, \u{1F7E1} 1 recommendation',
    );
  });

  it('returns empty string when all counts are zero', () => {
    expect(formatSummaryCounts(makeCounts())).toBe('');
  });
});
