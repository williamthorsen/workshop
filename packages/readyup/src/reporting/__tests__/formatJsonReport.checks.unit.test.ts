import { describe, expect, it } from 'vitest';

import { ReportSchema } from '../../schemas/reportSchema.ts';
import { VERSION } from '../../version.ts';
import { formatJsonReport } from '../formatJsonReport.ts';
import { formatReport } from '../test-utils/formatReport.ts';
import { buildSingleKitInput, makeReport } from '../test-utils/json-report-fixtures.ts';
import { makeFailedResult, makePassedResult, makeSkippedResult } from '../test-utils/result-fixtures.ts';

describe(formatJsonReport, () => {
  describe('check entries', () => {
    it('reports severity, ok, and skipReason when each applies', () => {
      const report = makeReport({
        results: [
          makePassedResult({ name: 'a', severity: 'warn', durationMs: 1 }),
          makeFailedResult({ name: 'b', severity: 'error', durationMs: 2 }),
          makeSkippedResult({ name: 'c', severity: 'recommend', skipReason: 'n/a' }),
        ],
        passed: false,
        durationMs: 15,
      });

      const parsed: unknown = JSON.parse(formatReport(buildSingleKitInput('deploy', report)));

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

      const output = formatReport(buildSingleKitInput('deploy', report));

      expect(output).not.toContain('skipReason');
    });

    it('serializes error as a string message', () => {
      const report = makeReport({
        results: [makeFailedResult({ name: 'a', error: new Error('connection refused') })],
        passed: false,
        durationMs: 5,
      });

      const parsed: unknown = JSON.parse(formatReport(buildSingleKitInput('deploy', report)));

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

      const parsed: unknown = JSON.parse(formatReport(buildSingleKitInput('deploy', report)));

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

      const parsed: unknown = JSON.parse(formatReport(buildSingleKitInput('deploy', report)));

      expect(parsed).toMatchObject({
        kits: [{ checklists: [{ checks: [{ progress: { type: 'percent', percent: 75 } }] }] }],
      });
    });

    it('serializes the count of files examined by a finding check', () => {
      const report = makeReport({
        results: [makePassedResult({ name: 'a', examinedCount: 12 })],
        passed: true,
        durationMs: 10,
      });

      const parsed: unknown = JSON.parse(formatReport(buildSingleKitInput('deploy', report)));

      expect(parsed).toMatchObject({ kits: [{ checklists: [{ checks: [{ examinedCount: 12 }] }] }] });
    });

    it('omits the examined count for a check that did not return findings', () => {
      const output = formatReport(
        buildSingleKitInput('deploy', makeReport({ results: [makePassedResult({ name: 'a' })] })),
      );

      expect(output).not.toContain('"examinedCount"');
    });
  });

  describe('nested checks', () => {
    it('nests child results under their parent checks array', () => {
      const report = makeReport({
        results: [makePassedResult({ name: 'parent', depth: 0 }), makePassedResult({ name: 'child', depth: 1 })],
        passed: true,
        durationMs: 20,
      });

      const parsed: unknown = JSON.parse(formatReport(buildSingleKitInput('deploy', report)));

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

      const parsed: unknown = JSON.parse(formatReport(buildSingleKitInput('deploy', report)));

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

      const parsed: unknown = JSON.parse(formatReport(buildSingleKitInput('deploy', report)));

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

      const parsed: unknown = JSON.parse(formatReport(buildSingleKitInput('deploy', report)));

      expect(parsed).toMatchObject({
        kits: [{ checklists: [{ checks: [{ name: 'na-parent', checks: [{ name: 'na-child' }] }] }] }],
      });
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
      const parsed: unknown = JSON.parse(formatReport(buildSingleKitInput('deploy', report), { detail: 'full' }));

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

      const parsed: unknown = JSON.parse(formatReport(buildSingleKitInput('deploy', report), { detail: 'summary' }));

      expect(parsed).toStrictEqual({
        schemaVersion: 2,
        readyupVersion: VERSION,
        passed: false,
        counts,
        worstSeverity: 'error',
        detail: 'summary',
        durationMs: 20,
        kits: [
          {
            name: 'deploy',
            passed: false,
            counts,
            worstSeverity: 'error',
            failOn: 'error',
            reportOn: 'recommend',
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

      const output = formatReport(buildSingleKitInput('deploy', clean), { detail: 'summary' });

      expect(output).not.toContain('checks');
    });

    it('produces a payload that the schema accepts in both projections', () => {
      for (const detail of ['full', 'summary'] as const) {
        const parsed: unknown = JSON.parse(formatReport(buildSingleKitInput('deploy', report), { detail }));
        expect(() => ReportSchema.parse(parsed)).not.toThrow();
      }
    });
  });

  describe('check ids', () => {
    it('reports the id of a check that declares one', () => {
      const withId = makeReport({
        results: [makePassedResult({ name: 'a', id: 'toolbelt.errors/no-instanceof-error' })],
      });

      const parsed: unknown = JSON.parse(formatReport(buildSingleKitInput('deploy', withId)));

      expect(parsed).toMatchObject({
        kits: [{ checklists: [{ checks: [{ name: 'a', id: 'toolbelt.errors/no-instanceof-error' }] }] }],
      });
    });

    it('omits the key for a check that declares none', () => {
      const output = formatReport(
        buildSingleKitInput('deploy', makeReport({ results: [makePassedResult({ name: 'a' })] })),
      );

      expect(output).not.toContain('"id"');
    });

    it('passes the id into the summary projection, where a failure is all that survives', () => {
      const failing = makeReport({
        results: [makeFailedResult({ name: 'a', id: 'toolbelt.errors/no-instanceof-error' })],
        passed: false,
      });

      const parsed: unknown = JSON.parse(formatReport(buildSingleKitInput('deploy', failing), { detail: 'summary' }));

      expect(parsed).toMatchObject({
        kits: [{ checklists: [{ checks: [{ name: 'a', id: 'toolbelt.errors/no-instanceof-error' }] }] }],
      });
    });
  });
});
