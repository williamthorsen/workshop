import { describe, expect, it } from 'vitest';

import { formatJsonReport } from '../src/formatJsonReport.ts';
import { ReportSchema } from '../src/schemas/index.ts';
import type { FailedResult, PassedResult, RdyReport, RdyResult, SkippedResult } from '../src/types.ts';
import { VERSION } from '../src/version.ts';
import { formatReport } from './helpers/formatReport.ts';

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

/** The tally a run with nothing to report produces, spelled out for whole-payload assertions. */
const NO_COUNTS = { passed: 0, errors: 0, warnings: 0, recommendations: 0, blocked: 0, optional: 0 };

describe(formatJsonReport, () => {
  it('produces valid JSON', () => {
    const output = formatReport(singleKit('deploy', makeReport()));

    expect(() => {
      JSON.parse(output);
    }).not.toThrow();
  });

  it('emits a payload its own published schema accepts', () => {
    const report = makeReport({
      results: [
        makePassedResult({ name: 'a' }),
        makeFailedResult({ name: 'b', fix: 'run install', detail: 'missing' }),
        makeSkippedResult({ name: 'c' }),
      ],
      passed: false,
      durationMs: 15,
    });

    const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report)));

    expect(() => ReportSchema.parse(parsed)).not.toThrow();
  });

  it('emits every level of a clean single-check run and nothing besides', () => {
    const report = makeReport({ results: [makePassedResult({ name: 'a' })], passed: true, durationMs: 10 });
    const counts = { ...NO_COUNTS, passed: 1 };

    const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report)));

    expect(parsed).toStrictEqual({
      schemaVersion: 1,
      readyupVersion: VERSION,
      passed: true,
      counts,
      failOn: 'error',
      reportOn: 'recommend',
      detail: 'full',
      durationMs: 10,
      kits: [
        {
          name: 'deploy',
          passed: true,
          counts,
          durationMs: 10,
          checklists: [
            {
              name: 'deploy',
              passed: true,
              counts,
              durationMs: 10,
              checks: [{ name: 'a', status: 'passed', ok: true, severity: 'error', durationMs: 10 }],
            },
          ],
        },
      ],
    });
  });

  it('omits the checks property from a checklist that reported nothing', () => {
    const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', makeReport())));

    expect(parsed).toStrictEqual({
      schemaVersion: 1,
      readyupVersion: VERSION,
      passed: true,
      counts: NO_COUNTS,
      failOn: 'error',
      reportOn: 'recommend',
      detail: 'full',
      durationMs: 0,
      kits: [
        {
          name: 'deploy',
          passed: true,
          counts: NO_COUNTS,
          durationMs: 0,
          checklists: [{ name: 'deploy', passed: true, counts: NO_COUNTS, durationMs: 0 }],
        },
      ],
    });
  });

  describe('provenance and echoed settings', () => {
    it('stamps the schema version and the runner version', () => {
      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', makeReport())));

      expect(parsed).toMatchObject({ schemaVersion: 1, readyupVersion: VERSION });
    });

    it('echoes the resolved thresholds and detail projection', () => {
      const parsed: unknown = JSON.parse(
        formatReport(singleKit('deploy', makeReport()), { failOn: 'warn', reportOn: 'error', detail: 'summary' }),
      );

      expect(parsed).toMatchObject({ failOn: 'warn', reportOn: 'error', detail: 'summary' });
    });

    it('carries collected warnings alongside the results', () => {
      const warnings = [{ code: 'version-skew' as const, message: 'kit is stale', remedy: 'Run `rdy compile`.' }];

      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', makeReport()), { warnings }));

      expect(parsed).toMatchObject({ warnings });
    });

    it('omits the warnings array entirely when the run produced none', () => {
      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', makeReport())));

      // The `warnings` count survives under `counts`; only the top-level advisory array goes away.
      expect(parsed).not.toHaveProperty('warnings');
      expect(parsed).toHaveProperty('counts.warnings', 0);
    });
  });

  describe('run verdict', () => {
    it('passes when every kit ran and no result failed', () => {
      const report = makeReport({ results: [makePassedResult({ name: 'a' })], passed: true });

      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({ passed: true });
    });

    it('fails when a checklist reports a failure at or above the threshold', () => {
      const report = makeReport({ results: [makeFailedResult({ name: 'a' })], passed: false });

      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({ passed: false, kits: [{ passed: false, checklists: [{ passed: false }] }] });
    });

    it('fails when a kit never ran, even though everything that ran passed', () => {
      const ran = { name: 'deploy', entries: [{ name: 'check', report: makeReport({ passed: true }) }] };
      const failed = { name: 'release', error: { code: 'kit-load' as const, message: 'Cannot find release.js' } };

      const parsed: unknown = JSON.parse(formatReport([ran, failed]));

      expect(parsed).toMatchObject({ passed: false });
    });

    it('holds a kit verdict that is false when any of its checklists failed', () => {
      const kit = {
        name: 'deploy',
        entries: [
          { name: 'clean', report: makeReport({ passed: true }) },
          { name: 'dirty', report: makeReport({ passed: false }) },
        ],
      };

      const parsed: unknown = JSON.parse(formatReport([kit]));

      expect(parsed).toMatchObject({
        kits: [{ passed: false, checklists: [{ passed: true }, { passed: false }] }],
      });
    });
  });

  describe('counts', () => {
    it('nests granular counts under `counts` for a single checklist', () => {
      const report = makeReport({
        results: [makePassedResult({ name: 'a' }), makeFailedResult({ name: 'b' }), makeSkippedResult({ name: 'c' })],
        passed: false,
        durationMs: 15,
      });

      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({
        counts: { passed: 1, errors: 1, warnings: 0, recommendations: 0, blocked: 1, optional: 0 },
        worstSeverity: 'error',
      });
    });

    it('aggregates counts across multiple checklists in a kit', () => {
      const report1 = makeReport({
        results: [makePassedResult({ name: 'a' }), makePassedResult({ name: 'b' })],
        passed: true,
        durationMs: 15,
      });
      const report2 = makeReport({ results: [makeFailedResult({ name: 'c' })], passed: false, durationMs: 3 });

      const parsed: unknown = JSON.parse(
        formatReport([
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
        counts: { passed: 2, errors: 1, warnings: 0, recommendations: 0, blocked: 0, optional: 0 },
        worstSeverity: 'error',
        kits: [{ name: 'deploy', checklists: [{ name: 'deploy' }, { name: 'infra' }] }],
      });
    });

    it('aggregates counts across multiple kits', () => {
      const report1 = makeReport({ results: [makePassedResult({ name: 'a' })], passed: true, durationMs: 10 });
      const report2 = makeReport({ results: [makeFailedResult({ name: 'b' })], passed: false, durationMs: 5 });

      const parsed: unknown = JSON.parse(
        formatReport([
          { name: 'kit1', entries: [{ name: 'check1', report: report1 }] },
          { name: 'kit2', entries: [{ name: 'check2', report: report2 }] },
        ]),
      );

      expect(parsed).toMatchObject({
        counts: { passed: 1, errors: 1 },
        worstSeverity: 'error',
        kits: [
          { name: 'kit1', counts: { passed: 1, errors: 0 } },
          { name: 'kit2', counts: { passed: 0, errors: 1 } },
        ],
      });
    });

    it('selects the highest severity across multiple failure buckets for worstSeverity', () => {
      const report = makeReport({
        results: [
          makeFailedResult({ name: 'e', severity: 'error' }),
          makeFailedResult({ name: 'w', severity: 'warn' }),
          makeFailedResult({ name: 'r', severity: 'recommend' }),
        ],
        passed: false,
      });

      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({
        counts: { errors: 1, warnings: 1, recommendations: 1 },
        worstSeverity: 'error',
      });
    });

    it('distinguishes blocked skips from optional skips', () => {
      const report = makeReport({
        results: [
          makeSkippedResult({ name: 'pre', skipReason: 'precondition' }),
          makeSkippedResult({ name: 'na', skipReason: 'n/a' }),
        ],
      });

      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({ counts: { blocked: 1, optional: 1 } });
    });

    it('counts all results across nesting levels', () => {
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

      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({
        counts: { passed: 2, errors: 1, blocked: 1 },
        worstSeverity: 'error',
        kits: [{ checklists: [{ counts: { passed: 2, errors: 1, blocked: 1 }, worstSeverity: 'error' }] }],
      });
    });
  });

  describe('slimming', () => {
    it('omits worstSeverity at every level when nothing failed', () => {
      const report = makeReport({ results: [makePassedResult({ name: 'a' })], passed: true, durationMs: 10 });

      const output = formatReport(singleKit('deploy', report));

      expect(output).not.toContain('worstSeverity');
    });

    it('emits fix on a failed check and withholds it from a passed one', () => {
      const report = makeReport({
        results: [
          makePassedResult({ name: 'clean', fix: 'never needed' }),
          makeFailedResult({ name: 'broken', fix: 'run install' }),
        ],
        passed: false,
      });

      const output = formatReport(singleKit('deploy', report));

      expect(output).toContain('run install');
      expect(output).not.toContain('never needed');
    });

    it('rounds every duration to whole milliseconds', () => {
      const report = makeReport({
        results: [makePassedResult({ name: 'a', durationMs: 3.6 })],
        passed: true,
        durationMs: 12.4,
      });

      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({
        durationMs: 12,
        kits: [{ durationMs: 12, checklists: [{ durationMs: 12, checks: [{ durationMs: 4 }] }] }],
      });
    });
  });

  describe('check entries', () => {
    it('carries severity, ok, and skipReason where each applies', () => {
      const report = makeReport({
        results: [
          makePassedResult({ name: 'a', severity: 'warn', durationMs: 1 }),
          makeFailedResult({ name: 'b', severity: 'error', durationMs: 2 }),
          makeSkippedResult({ name: 'c', severity: 'recommend', skipReason: 'n/a' }),
        ],
        passed: false,
        durationMs: 15,
      });

      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({
        kits: [
          {
            checklists: [
              {
                checks: [
                  { name: 'a', status: 'passed', ok: true, severity: 'warn', durationMs: 1 },
                  { name: 'b', status: 'failed', ok: false, severity: 'error', durationMs: 2 },
                  { name: 'c', status: 'skipped', ok: null, severity: 'recommend', skipReason: 'n/a' },
                ],
              },
            ],
          },
        ],
      });
    });

    it('withholds skipReason from a check that ran', () => {
      const report = makeReport({ results: [makePassedResult({ name: 'a' })], passed: true });

      const output = formatReport(singleKit('deploy', report));

      expect(output).not.toContain('skipReason');
    });

    it('serializes error as a string message', () => {
      const report = makeReport({
        results: [makeFailedResult({ name: 'a', error: new Error('connection refused') })],
        passed: false,
        durationMs: 5,
      });

      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({
        kits: [{ checklists: [{ checks: [{ error: 'connection refused' }] }] }],
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

      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report)));

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
        results: [makePassedResult({ name: 'a', progress: { type: 'percent', percent: 75 } })],
        passed: true,
        durationMs: 10,
      });

      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({
        kits: [{ checklists: [{ checks: [{ progress: { type: 'percent', percent: 75 } }] }] }],
      });
    });
  });

  describe('kits that produced no results', () => {
    const FAILURE = { name: 'release', error: { code: 'kit-load' as const, message: 'Cannot find release.js' } };

    /** A one-check kit that passes in 10ms, for pairing with a failed kit. */
    function ranKit(name: string) {
      const report = makeReport({ results: [makePassedResult({ name: 'a' })], passed: true, durationMs: 10 });
      return { name, entries: [{ name: 'check', report }] };
    }

    it('passes a failed kit through carrying only its name and error', () => {
      const parsed: unknown = JSON.parse(formatReport([FAILURE]));

      expect(parsed).toMatchObject({ counts: NO_COUNTS, durationMs: 0, kits: [FAILURE] });
    });

    it('keeps kits in the order they were requested', () => {
      const parsed: unknown = JSON.parse(formatReport([ranKit('first'), FAILURE, ranKit('last')]));

      expect(parsed).toMatchObject({ kits: [{ name: 'first' }, { name: 'release' }, { name: 'last' }] });
    });

    it('leaves top-level counts and duration to the kits that ran', () => {
      const parsed: unknown = JSON.parse(formatReport([ranKit('deploy'), FAILURE]));

      expect(parsed).toMatchObject({ counts: { ...NO_COUNTS, passed: 1 }, durationMs: 10 });
    });
  });

  describe('nested checks', () => {
    it('nests child results under their parent checks array', () => {
      const report = makeReport({
        results: [makePassedResult({ name: 'parent', depth: 0 }), makePassedResult({ name: 'child', depth: 1 })],
        passed: true,
        durationMs: 20,
      });

      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({
        kits: [{ checklists: [{ checks: [{ name: 'parent', checks: [{ name: 'child' }] }] }] }],
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

      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({
        kits: [
          {
            checklists: [
              {
                checks: [
                  { name: 'A', checks: [{ name: 'A1' }, { name: 'A2' }] },
                  { name: 'B', checks: [{ name: 'B1' }] },
                ],
              },
            ],
          },
        ],
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

      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({
        kits: [{ checklists: [{ checks: [{ name: 'L0', checks: [{ name: 'L1', checks: [{ name: 'L2' }] }] }] }] }],
      });
    });

    it('includes n/a subtrees in JSON output', () => {
      const report = makeReport({
        results: [
          makeSkippedResult({ name: 'na-parent', skipReason: 'n/a', depth: 0 }),
          makeSkippedResult({ name: 'na-child', skipReason: 'n/a', depth: 1 }),
        ],
        passed: true,
      });

      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report)));

      expect(parsed).toMatchObject({
        kits: [{ checklists: [{ checks: [{ name: 'na-parent', checks: [{ name: 'na-child' }] }] }] }],
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

      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report), { reportOn: 'error' }));

      expect(parsed).toMatchObject({ kits: [{ checklists: [{ checks: [{ name: 'error-check' }] }] }] });
    });

    it('counts every result in granular buckets, including results pruned from the tree', () => {
      const report = makeReport({
        results: [
          makePassedResult({ name: 'a', severity: 'error' }),
          makeFailedResult({ name: 'b', severity: 'recommend' }),
        ],
        passed: false,
        durationMs: 15,
      });

      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report), { reportOn: 'error' }));

      expect(parsed).toMatchObject({
        counts: { passed: 1, errors: 0, warnings: 0, recommendations: 1, blocked: 0, optional: 0 },
        worstSeverity: 'recommend',
      });
    });

    it('reports a below-threshold failure in the counts while omitting it from the detail tree', () => {
      const report = makeReport({
        results: [
          makePassedResult({ name: 'error-pass', severity: 'error' }),
          makeFailedResult({ name: 'warn-fail', severity: 'warn' }),
        ],
        passed: false,
        durationMs: 15,
      });

      const output = formatReport(singleKit('deploy', report), { reportOn: 'error' });
      const parsed: unknown = JSON.parse(output);

      expect(parsed).toMatchObject({
        counts: { warnings: 1 },
        worstSeverity: 'warn',
        kits: [
          {
            counts: { warnings: 1 },
            checklists: [{ counts: { warnings: 1 }, checks: [{ name: 'error-pass' }] }],
          },
        ],
      });
      expect(output).not.toContain('warn-fail');
    });
  });

  describe('detail projection', () => {
    const report = makeReport({
      results: [
        makePassedResult({ name: 'clean', depth: 0 }),
        makeFailedResult({ name: 'broken', fix: 'run install', detail: 'missing dependency', depth: 0 }),
        makeFailedResult({ name: 'nested-break', fix: 'rebuild', depth: 1 }),
        makeSkippedResult({ name: 'blocked', depth: 0 }),
      ],
      passed: false,
      durationMs: 20,
    });

    it('keeps every result in the tree under `full`', () => {
      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report), { detail: 'full' }));

      expect(parsed).toMatchObject({
        kits: [
          {
            checklists: [
              {
                checks: [
                  { name: 'clean' },
                  { name: 'broken', detail: 'missing dependency', checks: [{ name: 'nested-break' }] },
                  { name: 'blocked' },
                ],
              },
            ],
          },
        ],
      });
    });

    it('reduces the tree to failed checks and their fixes under `summary`', () => {
      const counts = { passed: 1, errors: 2, warnings: 0, recommendations: 0, blocked: 1, optional: 0 };

      const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report), { detail: 'summary' }));

      expect(parsed).toStrictEqual({
        schemaVersion: 1,
        readyupVersion: VERSION,
        passed: false,
        counts,
        worstSeverity: 'error',
        failOn: 'error',
        reportOn: 'recommend',
        detail: 'summary',
        durationMs: 20,
        kits: [
          {
            name: 'deploy',
            passed: false,
            counts,
            worstSeverity: 'error',
            durationMs: 20,
            checklists: [
              {
                name: 'deploy',
                passed: false,
                counts,
                worstSeverity: 'error',
                durationMs: 20,
                checks: [
                  { name: 'broken', status: 'failed', ok: false, severity: 'error', durationMs: 5, fix: 'run install' },
                  {
                    name: 'nested-break',
                    status: 'failed',
                    ok: false,
                    severity: 'error',
                    durationMs: 5,
                    fix: 'rebuild',
                  },
                ],
              },
            ],
          },
        ],
      });
    });

    it('omits the checks property when no check failed', () => {
      const clean = makeReport({ results: [makePassedResult({ name: 'a' })], passed: true });

      const output = formatReport(singleKit('deploy', clean), { detail: 'summary' });

      expect(output).not.toContain('checks');
    });

    it('produces a payload the schema accepts in both projections', () => {
      for (const detail of ['full', 'summary'] as const) {
        const parsed: unknown = JSON.parse(formatReport(singleKit('deploy', report), { detail }));
        expect(() => ReportSchema.parse(parsed)).not.toThrow();
      }
    });
  });
});
