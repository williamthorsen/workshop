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

/** Wrap a single checklist report as a single-kit input. */
function singleKit(checklistName: string, report: RdyReport, kitName = 'deploy') {
  return [{ name: kitName, entries: [{ name: checklistName, report }] }];
}

describe(formatJsonReport, () => {
  it('produces valid JSON', () => {
    const output = formatJsonReport(singleKit('deploy', makeReport()));

    expect(() => {
      JSON.parse(output);
    }).not.toThrow();
  });

  it('returns granular summary counts for a single checklist', () => {
    const report = makeReport({
      results: [makePassedResult({ name: 'a' }), makeFailedResult({ name: 'b' }), makeSkippedResult({ name: 'c' })],
      passed: false,
      durationMs: 15,
    });

    const parsed: unknown = JSON.parse(formatJsonReport(singleKit('deploy', report)));

    expect(parsed).toMatchObject({
      passed: 1,
      errors: 1,
      warnings: 0,
      recommendations: 0,
      blocked: 1,
      optional: 0,
      worstSeverity: 'error',
    });
  });

  it('aggregates granular counts across multiple checklists in a kit', () => {
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
        {
          name: 'deploy',
          entries: [
            { name: 'deploy', report: report1 },
            { name: 'infra', report: report2 },
          ],
        },
      ]),
    );

    expect(parsed).toMatchObject({
      passed: 2,
      errors: 1,
      warnings: 0,
      recommendations: 0,
      blocked: 0,
      optional: 0,
      worstSeverity: 'error',
      kits: [
        {
          name: 'deploy',
          checklists: expect.arrayContaining([expect.anything(), expect.anything()]),
        },
      ],
    });
  });

  it('aggregates counts across multiple kits', () => {
    const report1 = makeReport({
      results: [makePassedResult({ name: 'a' })],
      passed: true,
      durationMs: 10,
    });
    const report2 = makeReport({
      results: [makeFailedResult({ name: 'b' })],
      passed: false,
      durationMs: 5,
    });

    const parsed: unknown = JSON.parse(
      formatJsonReport([
        { name: 'kit1', entries: [{ name: 'check1', report: report1 }] },
        { name: 'kit2', entries: [{ name: 'check2', report: report2 }] },
      ]),
    );

    expect(parsed).toMatchObject({
      passed: 1,
      errors: 1,
      worstSeverity: 'error',
      kits: [
        { name: 'kit1', passed: 1, errors: 0 },
        { name: 'kit2', passed: 0, errors: 1 },
      ],
    });
  });

  it('includes granular checklist-level counts and null worstSeverity when all passed', () => {
    const report = makeReport({
      results: [makePassedResult({ name: 'a' })],
      passed: true,
      durationMs: 10,
    });

    const parsed: unknown = JSON.parse(formatJsonReport(singleKit('deploy', report)));

    expect(parsed).toMatchObject({
      kits: [
        {
          name: 'deploy',
          checklists: [
            {
              name: 'deploy',
              passed: 1,
              errors: 0,
              warnings: 0,
              recommendations: 0,
              blocked: 0,
              optional: 0,
              worstSeverity: null,
              durationMs: 10,
            },
          ],
        },
      ],
    });
  });

  it('sets worstSeverity to null when checks are skipped but none failed', () => {
    const report = makeReport({
      results: [makeSkippedResult({ name: 'a' }), makeSkippedResult({ name: 'b' })],
      passed: true,
      durationMs: 0,
    });

    const parsed: unknown = JSON.parse(formatJsonReport(singleKit('deploy', report)));

    expect(parsed).toMatchObject({
      passed: 0,
      errors: 0,
      warnings: 0,
      recommendations: 0,
      blocked: 2,
      optional: 0,
      worstSeverity: null,
    });
  });

  it('emits the expected top-level shape with kits array', () => {
    const report = makeReport({
      results: [makePassedResult({ name: 'a' })],
      passed: true,
      durationMs: 10,
    });

    const parsed: unknown = JSON.parse(formatJsonReport(singleKit('deploy', report)));
    if (typeof parsed !== 'object' || parsed === null) throw new Error('expected object');
    // eslint-disable-next-line unicorn/no-array-sort -- toSorted requires Node 20+; engine target is >=18.17.0
    const topLevelKeys = Object.keys(parsed).sort();

    expect(topLevelKeys).toStrictEqual([
      'blocked',
      'durationMs',
      'errors',
      'kits',
      'optional',
      'passed',
      'recommendations',
      'warnings',
      'worstSeverity',
    ]);
  });

  it('selects the highest severity across multiple failure buckets for worstSeverity', () => {
    const report = makeReport({
      results: [
        makeFailedResult({ name: 'e', severity: 'error' }),
        makeFailedResult({ name: 'w', severity: 'warn' }),
        makeFailedResult({ name: 'r', severity: 'recommend' }),
      ],
      passed: false,
      durationMs: 0,
    });

    const parsed: unknown = JSON.parse(formatJsonReport(singleKit('deploy', report)));

    expect(parsed).toMatchObject({
      errors: 1,
      warnings: 1,
      recommendations: 1,
      worstSeverity: 'error',
    });
  });

  it('distinguishes blocked skips from optional skips', () => {
    const report = makeReport({
      results: [
        makeSkippedResult({ name: 'pre', skipReason: 'precondition' }),
        makeSkippedResult({ name: 'na', skipReason: 'n/a' }),
      ],
      passed: true,
      durationMs: 0,
    });

    const parsed: unknown = JSON.parse(formatJsonReport(singleKit('deploy', report)));

    expect(parsed).toMatchObject({
      blocked: 1,
      optional: 1,
    });
  });

  it('serializes error as a string message', () => {
    const report = makeReport({
      results: [makeFailedResult({ name: 'a', error: new Error('connection refused') })],
      passed: false,
      durationMs: 5,
    });

    const parsed: unknown = JSON.parse(formatJsonReport(singleKit('deploy', report)));

    expect(parsed).toMatchObject({
      kits: [{ checklists: [{ checks: [{ error: 'connection refused' }] }] }],
    });
  });

  it('includes all fields as non-optional (null, not absent)', () => {
    const report = makeReport({
      results: [makePassedResult({ name: 'a' })],
      passed: true,
      durationMs: 10,
    });

    const output = formatJsonReport(singleKit('deploy', report));
    const parsed: unknown = JSON.parse(output);

    expect(parsed).toMatchObject({
      kits: [
        {
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

    const parsed: unknown = JSON.parse(formatJsonReport(singleKit('deploy', report)));

    expect(parsed).toMatchObject({
      kits: [
        {
          checklists: [
            {
              checks: [
                { severity: 'warn', ok: true, skipReason: null },
                { severity: 'error', ok: false, skipReason: null },
                { severity: 'recommend', ok: null, skipReason: 'n/a' },
              ],
            },
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

    const parsed: unknown = JSON.parse(formatJsonReport(singleKit('deploy', report)));

    expect(parsed).toMatchObject({
      kits: [
        {
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

    const parsed: unknown = JSON.parse(formatJsonReport(singleKit('deploy', report)));

    expect(parsed).toMatchObject({
      kits: [{ checklists: [{ checks: [{ progress: { type: 'percent', percent: 75 } }] }] }],
    });
  });

  describe('nested checks', () => {
    it('nests child results under their parent checks array', () => {
      const report = makeReport({
        results: [makePassedResult({ name: 'parent', depth: 0 }), makePassedResult({ name: 'child', depth: 1 })],
        passed: true,
        durationMs: 20,
      });

      const parsed: unknown = JSON.parse(formatJsonReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({
        kits: [
          {
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

      const parsed: unknown = JSON.parse(formatJsonReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({
        kits: [{ checklists: [{ checks: [{ name: 'top-check', checks: [] }] }] }],
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

      const parsed: unknown = JSON.parse(formatJsonReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({
        kits: [
          {
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

      const parsed: unknown = JSON.parse(formatJsonReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({
        kits: [{ checklists: [{ checks: [{ name: 'leaf', checks: [] }] }] }],
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

      const parsed: unknown = JSON.parse(formatJsonReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({
        kits: [
          {
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
          },
        ],
      });
    });

    it('counts all results across nesting levels in granular summary', () => {
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

      const parsed: unknown = JSON.parse(formatJsonReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({
        passed: 2,
        errors: 1,
        blocked: 1,
        worstSeverity: 'error',
        kits: [{ checklists: [{ passed: 2, errors: 1, blocked: 1, worstSeverity: 'error' }] }],
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

      const parsed: unknown = JSON.parse(formatJsonReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({
        kits: [
          {
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

      const parsed: unknown = JSON.parse(formatJsonReport(singleKit('deploy', report), { reportOn: 'error' }));

      expect(parsed).toMatchObject({
        kits: [{ checklists: [{ checks: [{ name: 'error-check' }] }] }],
      });
    });

    it('counts only visible results in granular buckets', () => {
      const report = makeReport({
        results: [
          makePassedResult({ name: 'a', severity: 'error' }),
          makeFailedResult({ name: 'b', severity: 'recommend' }),
        ],
        passed: false,
        durationMs: 15,
      });

      const parsed: unknown = JSON.parse(formatJsonReport(singleKit('deploy', report), { reportOn: 'error' }));

      expect(parsed).toMatchObject({
        passed: 1,
        errors: 0,
        warnings: 0,
        recommendations: 0,
        blocked: 0,
        optional: 0,
        worstSeverity: null,
      });
    });
  });
});
