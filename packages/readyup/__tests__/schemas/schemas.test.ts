import { describe, expect, expectTypeOf, it } from 'vitest';

import type { RdyErrorCode } from '../../src/errors.ts';
import type { JsonErrorCode, JsonSeverity } from '../../src/schemas/index.ts';
import {
  CompileOutputSchema,
  ErrorEnvelopeSchema,
  ListOutputSchema,
  ReportSchema,
  VerifyOutputSchema,
} from '../../src/schemas/index.ts';
import type { Severity } from '../../src/types.ts';

/** A report exercising every optional field, three levels of nesting, and both kit-entry shapes. */
const report = {
  schemaVersion: 1,
  readyupVersion: '0.21.2',
  passed: false,
  counts: { passed: 2, errors: 1, warnings: 0, recommendations: 0, blocked: 1, optional: 0 },
  worstSeverity: 'error',
  failOn: 'error',
  reportOn: 'recommend',
  detail: 'full',
  durationMs: 42,
  warnings: [{ code: 'version-skew', message: 'kit is stale', remedy: 'Run `rdy compile` to refresh.' }],
  kits: [
    {
      name: 'deploy',
      passed: false,
      counts: { passed: 2, errors: 1, warnings: 0, recommendations: 0, blocked: 1, optional: 0 },
      worstSeverity: 'error',
      durationMs: 42,
      checklists: [
        {
          name: 'preflight',
          passed: false,
          counts: { passed: 2, errors: 1, warnings: 0, recommendations: 0, blocked: 1, optional: 0 },
          worstSeverity: 'error',
          durationMs: 42,
          checks: [
            {
              name: 'gate',
              status: 'passed',
              ok: true,
              severity: 'error',
              durationMs: 3,
              progress: { type: 'fraction', passedCount: 3, count: 5 },
              checks: [
                {
                  name: 'child',
                  status: 'failed',
                  ok: false,
                  severity: 'error',
                  durationMs: 1,
                  detail: 'missing dependency',
                  fix: 'run install',
                  error: 'ENOENT',
                  checks: [{ name: 'grandchild', status: 'skipped', ok: null, severity: 'error', durationMs: 0 }],
                },
              ],
            },
            { name: 'optional', status: 'skipped', ok: null, severity: 'warn', durationMs: 0, skipReason: 'n/a' },
          ],
        },
      ],
    },
    { name: 'release', error: { code: 'kit-load', message: 'Cannot find release.js' } },
  ],
};

/** The smallest report the schema accepts: every optional field absent. */
const minimalReport = {
  schemaVersion: 1,
  readyupVersion: '0.21.2',
  passed: true,
  counts: { passed: 0, errors: 0, warnings: 0, recommendations: 0, blocked: 0, optional: 0 },
  failOn: 'error',
  reportOn: 'recommend',
  detail: 'summary',
  durationMs: 0,
  kits: [],
};

const errorEnvelope = { schemaVersion: 1, error: { code: 'usage', message: "Unknown option '--bogus'" } };

const listOutput = {
  schemaVersion: 1,
  kits: [
    { name: 'deploy', kind: 'compiled', path: 'deploy.js', readyupVersion: '0.21.2', checklists: ['preflight'] },
    { name: 'draft', kind: 'internal' },
  ],
};

const verifyOutput = {
  schemaVersion: 1,
  passed: false,
  kits: [
    { name: 'deploy', status: 'ok' },
    { name: 'release', status: 'drift', expected: 'abc123', actual: 'def456' },
  ],
};

const compileOutput = {
  schemaVersion: 1,
  passed: false,
  kits: [
    { name: 'deploy', status: 'compiled' },
    { name: 'release', status: 'failed', error: 'Kit must export a default RdyKit' },
  ],
};

describe('JSON payload schemas', () => {
  describe('representative payloads', () => {
    it.each([
      ['report', ReportSchema, report],
      ['minimal report', ReportSchema, minimalReport],
      ['error envelope', ErrorEnvelopeSchema, errorEnvelope],
      ['list', ListOutputSchema, listOutput],
      ['verify', VerifyOutputSchema, verifyOutput],
      ['compile', CompileOutputSchema, compileOutput],
    ])('accepts a representative %s payload', (_label, schema, payload) => {
      expect(() => schema.parse(payload)).not.toThrow();
    });
  });

  describe('required fields', () => {
    it.each(['schemaVersion', 'readyupVersion', 'passed', 'counts', 'failOn', 'reportOn', 'detail', 'kits'])(
      'rejects a report missing %s',
      (field) => {
        const incomplete = Object.fromEntries(Object.entries(minimalReport).filter(([key]) => key !== field));

        expect(() => ReportSchema.parse(incomplete)).toThrow();
      },
    );

    it('rejects a counts object missing one of its six buckets', () => {
      const counts = { passed: 0, errors: 0, warnings: 0, recommendations: 0, blocked: 0 };

      expect(() => ReportSchema.parse({ ...minimalReport, counts })).toThrow();
    });
  });

  describe('collision fields', () => {
    it('reads `passed` as a verdict at every level and as a count only under `counts`', () => {
      const parsed = ReportSchema.parse(report);
      const kit = parsed.kits[0];
      if (kit === undefined || 'error' in kit) throw new Error('expected a kit that ran');

      expect(parsed.passed).toBe(false);
      expect(parsed.counts.passed).toBe(2);
      expect(kit.passed).toBe(false);
      expect(kit.checklists[0]?.passed).toBe(false);
    });

    it('reads `warnings` as advisory entries at the top level and as a count only under `counts`', () => {
      const parsed = ReportSchema.parse(report);

      expect(parsed.warnings).toStrictEqual([
        { code: 'version-skew', message: 'kit is stale', remedy: 'Run `rdy compile` to refresh.' },
      ]);
      expect(parsed.counts.warnings).toBe(0);
    });

    it('rejects a numeric `warnings` at the top level, where the old flat shape put the count', () => {
      expect(() => ReportSchema.parse({ ...minimalReport, warnings: 3 })).toThrow();
    });
  });

  describe('kit entries', () => {
    it('accepts a counts-free error entry', () => {
      const kits = [{ name: 'release', error: { code: 'config', message: 'boom' } }];

      expect(() => ReportSchema.parse({ ...minimalReport, kits })).not.toThrow();
    });

    it('rejects a kit that carries neither results nor an error', () => {
      expect(() => ReportSchema.parse({ ...minimalReport, kits: [{ name: 'orphan' }] })).toThrow();
    });
  });

  describe('derived types', () => {
    it('keeps the wire severity vocabulary in step with the runner type', () => {
      expectTypeOf<JsonSeverity>().toEqualTypeOf<Severity>();
    });

    it('keeps the wire error taxonomy in step with RdyErrorCode', () => {
      expectTypeOf<JsonErrorCode>().toEqualTypeOf<RdyErrorCode>();
    });
  });
});
