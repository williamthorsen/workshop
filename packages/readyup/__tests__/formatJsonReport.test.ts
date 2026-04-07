import { describe, expect, it } from 'vitest';

import { formatJsonReport } from '../src/formatJsonReport.ts';
import type { FailedResult, PassedResult, RdyReport, RdyResult, SkippedResult } from '../src/types.ts';

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
  return { results: [], passed: true, durationMs: 0, ...overrides };
}

describe(formatJsonReport, () => {
  it('produces valid JSON', () => {
    const output = formatJsonReport([{ name: 'deploy', report: makeReport() }]);

    expect(() => {
      JSON.parse(output);
    }).not.toThrow();
  });

  it('returns correct summary counts for a single checklist', () => {
    const report = makeReport({
      results: [makePassedResult({ name: 'a' }), makeFailedResult({ name: 'b' }), makeSkippedResult({ name: 'c' })],
      passed: false,
      durationMs: 15,
    });

    const parsed: unknown = JSON.parse(formatJsonReport([{ name: 'deploy', report }]));

    expect(parsed).toMatchObject({
      passed: 1,
      failed: 1,
      skipped: 1,
      allPassed: false,
    });
  });

  it('aggregates counts across multiple checklists', () => {
    const report1 = makeReport({
      results: [makePassedResult({ name: 'a' }), makePassedResult({ name: 'b' })],
      passed: true,
      durationMs: 15,
    });
    const report2 = makeReport({
      results: [makeFailedResult({ name: 'c' })],
      passed: false,
      durationMs: 3,
    });

    const parsed: unknown = JSON.parse(
      formatJsonReport([
        { name: 'deploy', report: report1 },
        { name: 'infra', report: report2 },
      ]),
    );

    expect(parsed).toMatchObject({
      passed: 2,
      failed: 1,
      skipped: 0,
      allPassed: false,
      checklists: expect.arrayContaining([expect.anything(), expect.anything()]),
    });
  });

  it('includes checklist-level allPassed and counts', () => {
    const report = makeReport({
      results: [makePassedResult({ name: 'a' })],
      passed: true,
      durationMs: 10,
    });

    const parsed: unknown = JSON.parse(formatJsonReport([{ name: 'deploy', report }]));

    expect(parsed).toMatchObject({
      checklists: [
        {
          name: 'deploy',
          allPassed: true,
          passed: 1,
          failed: 0,
          skipped: 0,
          durationMs: 10,
        },
      ],
    });
  });

  it('sets top-level allPassed to true when checks are skipped but none failed', () => {
    const report = makeReport({
      results: [makeSkippedResult({ name: 'a' }), makeSkippedResult({ name: 'b' })],
      passed: true,
      durationMs: 0,
    });

    const parsed: unknown = JSON.parse(formatJsonReport([{ name: 'deploy', report }]));

    expect(parsed).toMatchObject({
      allPassed: true,
      passed: 0,
      failed: 0,
      skipped: 2,
    });
  });

  it('emits the expected top-level shape with no summary wrapper', () => {
    const report = makeReport({
      results: [makePassedResult({ name: 'a' })],
      passed: true,
      durationMs: 10,
    });

    const parsed: unknown = JSON.parse(formatJsonReport([{ name: 'deploy', report }]));
    if (typeof parsed !== 'object' || parsed === null) throw new Error('expected object');
    // eslint-disable-next-line unicorn/no-array-sort -- toSorted requires Node 20+; engine target is >=18.17.0
    const topLevelKeys = Object.keys(parsed).sort();

    expect(topLevelKeys).toStrictEqual(['allPassed', 'checklists', 'durationMs', 'failed', 'passed', 'skipped']);
  });

  it('serializes error as a string message', () => {
    const report = makeReport({
      results: [makeFailedResult({ name: 'a', error: new Error('connection refused') })],
      passed: false,
      durationMs: 5,
    });

    const parsed: unknown = JSON.parse(formatJsonReport([{ name: 'deploy', report }]));

    expect(parsed).toMatchObject({
      checklists: [{ checks: [{ error: 'connection refused' }] }],
    });
  });

  it('includes all fields as non-optional (null, not absent)', () => {
    const report = makeReport({
      results: [makePassedResult({ name: 'a' })],
      passed: true,
      durationMs: 10,
    });

    const output = formatJsonReport([{ name: 'deploy', report }]);
    const parsed: unknown = JSON.parse(output);

    expect(parsed).toMatchObject({
      checklists: [
        {
          checks: [
            {
              name: 'a',
              status: 'passed',
              ok: true,
              severity: 'error',
              skipReason: null,
              detail: null,
              fix: null,
              error: null,
              progress: null,
            },
          ],
        },
      ],
    });
  });

  it('includes severity, ok, and skipReason on every check entry', () => {
    const report = makeReport({
      results: [
        makePassedResult({ name: 'a', severity: 'warn' }),
        makeFailedResult({ name: 'b', severity: 'error' }),
        makeSkippedResult({ name: 'c', severity: 'recommend', skipReason: 'n/a' }),
      ],
      passed: false,
      durationMs: 15,
    });

    const parsed: unknown = JSON.parse(formatJsonReport([{ name: 'deploy', report }]));

    expect(parsed).toMatchObject({
      checklists: [
        {
          checks: [
            { severity: 'warn', ok: true, skipReason: null },
            { severity: 'error', ok: false, skipReason: null },
            { severity: 'recommend', ok: null, skipReason: 'n/a' },
          ],
        },
      ],
    });
  });

  it('includes optional fields when present', () => {
    const report = makeReport({
      results: [
        makeFailedResult({
          name: 'a',
          fix: 'run npm install',
          detail: 'missing dependency',
          progress: { type: 'fraction', passedCount: 3, count: 5 },
        }),
      ],
      passed: false,
      durationMs: 10,
    });

    const parsed: unknown = JSON.parse(formatJsonReport([{ name: 'deploy', report }]));

    expect(parsed).toMatchObject({
      checklists: [
        {
          checks: [
            {
              fix: 'run npm install',
              detail: 'missing dependency',
              progress: { type: 'fraction', passedCount: 3, count: 5 },
            },
          ],
        },
      ],
    });
  });

  it('serializes percent-based progress', () => {
    const report = makeReport({
      results: [
        makePassedResult({
          name: 'a',
          progress: { type: 'percent', percent: 75 },
        }),
      ],
      passed: true,
      durationMs: 10,
    });

    const parsed: unknown = JSON.parse(formatJsonReport([{ name: 'deploy', report }]));

    expect(parsed).toMatchObject({
      checklists: [{ checks: [{ progress: { type: 'percent', percent: 75 } }] }],
    });
  });

  describe('nested checks', () => {
    it('nests child results under their parent checks array', () => {
      const report = makeReport({
        results: [makePassedResult({ name: 'parent', depth: 0 }), makePassedResult({ name: 'child', depth: 1 })],
        passed: true,
        durationMs: 20,
      });

      const parsed: unknown = JSON.parse(formatJsonReport([{ name: 'deploy', report }]));

      expect(parsed).toMatchObject({
        checklists: [
          {
            checks: [
              {
                name: 'parent',
                checks: [{ name: 'child', checks: [] }],
              },
            ],
          },
        ],
      });
    });

    it('places depth-0 result at the top level of the tree', () => {
      const report = makeReport({
        results: [makePassedResult({ name: 'top-check', depth: 0 })],
        passed: true,
        durationMs: 10,
      });

      const parsed: unknown = JSON.parse(formatJsonReport([{ name: 'deploy', report }]));

      expect(parsed).toMatchObject({
        checklists: [{ checks: [{ name: 'top-check', checks: [] }] }],
      });
    });

    it('reconstructs multi-level nesting from flat depth-first results', () => {
      const report = makeReport({
        results: [
          makePassedResult({ name: 'A', depth: 0 }),
          makePassedResult({ name: 'A1', depth: 1 }),
          makePassedResult({ name: 'A2', depth: 1 }),
          makePassedResult({ name: 'B', depth: 0 }),
          makePassedResult({ name: 'B1', depth: 1 }),
        ],
        passed: true,
        durationMs: 50,
      });

      const parsed: unknown = JSON.parse(formatJsonReport([{ name: 'deploy', report }]));

      expect(parsed).toMatchObject({
        checklists: [
          {
            checks: [
              {
                name: 'A',
                checks: [
                  { name: 'A1', checks: [] },
                  { name: 'A2', checks: [] },
                ],
              },
              {
                name: 'B',
                checks: [{ name: 'B1', checks: [] }],
              },
            ],
          },
        ],
      });
    });

    it('produces empty checks array for leaf entries', () => {
      const report = makeReport({
        results: [makePassedResult({ name: 'leaf', depth: 0 })],
        passed: true,
        durationMs: 10,
      });

      const parsed: unknown = JSON.parse(formatJsonReport([{ name: 'deploy', report }]));

      expect(parsed).toMatchObject({
        checklists: [{ checks: [{ name: 'leaf', checks: [] }] }],
      });
    });

    it('includes n/a subtrees in JSON output', () => {
      const report = makeReport({
        results: [
          makeSkippedResult({ name: 'na-parent', skipReason: 'n/a', depth: 0 }),
          makeSkippedResult({ name: 'na-child', skipReason: 'n/a', depth: 1 }),
        ],
        passed: true,
        durationMs: 0,
      });

      const parsed: unknown = JSON.parse(formatJsonReport([{ name: 'deploy', report }]));

      expect(parsed).toMatchObject({
        checklists: [
          {
            checks: [
              {
                name: 'na-parent',
                checks: [{ name: 'na-child' }],
              },
            ],
          },
        ],
      });
    });

    it('counts all results across nesting levels in summary', () => {
      const report = makeReport({
        results: [
          makePassedResult({ name: 'parent', depth: 0 }),
          makePassedResult({ name: 'child-pass', depth: 1 }),
          makeFailedResult({ name: 'child-fail', depth: 1 }),
          makeSkippedResult({ name: 'child-skip', depth: 1 }),
        ],
        passed: false,
        durationMs: 30,
      });

      const parsed: unknown = JSON.parse(formatJsonReport([{ name: 'deploy', report }]));

      expect(parsed).toMatchObject({
        passed: 2,
        failed: 1,
        skipped: 1,
        checklists: [{ passed: 2, failed: 1, skipped: 1 }],
      });
    });

    it('reconstructs three levels of nesting', () => {
      const report = makeReport({
        results: [
          makePassedResult({ name: 'L0', depth: 0 }),
          makePassedResult({ name: 'L1', depth: 1 }),
          makePassedResult({ name: 'L2', depth: 2 }),
        ],
        passed: true,
        durationMs: 30,
      });

      const parsed: unknown = JSON.parse(formatJsonReport([{ name: 'deploy', report }]));

      expect(parsed).toMatchObject({
        checklists: [
          {
            checks: [
              {
                name: 'L0',
                checks: [
                  {
                    name: 'L1',
                    checks: [{ name: 'L2', checks: [] }],
                  },
                ],
              },
            ],
          },
        ],
      });
    });
  });

  describe('reporting threshold', () => {
    it('excludes results below the reporting threshold', () => {
      const report = makeReport({
        results: [
          makePassedResult({ name: 'error-check', severity: 'error' }),
          makePassedResult({ name: 'recommend-check', severity: 'recommend' }),
        ],
        passed: true,
        durationMs: 20,
      });

      const parsed: unknown = JSON.parse(formatJsonReport([{ name: 'deploy', report }], { reportOn: 'error' }));

      expect(parsed).toMatchObject({
        checklists: [{ checks: [{ name: 'error-check' }] }],
      });
    });

    it('counts only visible results', () => {
      const report = makeReport({
        results: [
          makePassedResult({ name: 'a', severity: 'error' }),
          makeFailedResult({ name: 'b', severity: 'recommend' }),
        ],
        passed: false,
        durationMs: 15,
      });

      const parsed: unknown = JSON.parse(formatJsonReport([{ name: 'deploy', report }], { reportOn: 'error' }));

      expect(parsed).toMatchObject({
        passed: 1,
        failed: 0,
        skipped: 0,
      });
    });
  });
});
