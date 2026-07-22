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
import {
  compilePayload,
  errorEnvelopePayload,
  listPayload,
  minimalReportPayload,
  reportPayload,
  verifyPayload,
} from '../helpers/payloadFixtures.ts';

describe('JSON payload schemas', () => {
  describe('representative payloads', () => {
    it.each([
      ['report', ReportSchema, reportPayload],
      ['minimal report', ReportSchema, minimalReportPayload],
      ['error envelope', ErrorEnvelopeSchema, errorEnvelopePayload],
      ['list', ListOutputSchema, listPayload],
      ['verify', VerifyOutputSchema, verifyPayload],
      ['compile', CompileOutputSchema, compilePayload],
    ])('accepts a representative %s payload', (_label, schema, payload) => {
      expect(() => schema.parse(payload)).not.toThrow();
    });
  });

  describe('required fields', () => {
    it.each(['schemaVersion', 'readyupVersion', 'passed', 'counts', 'failOn', 'reportOn', 'detail', 'kits'])(
      'rejects a report missing %s',
      (field) => {
        const incomplete = Object.fromEntries(Object.entries(minimalReportPayload).filter(([key]) => key !== field));

        expect(() => ReportSchema.parse(incomplete)).toThrow();
      },
    );

    it('rejects a counts object missing one of its six buckets', () => {
      const counts = { passed: 0, errors: 0, warnings: 0, recommendations: 0, blocked: 0 };

      expect(() => ReportSchema.parse({ ...minimalReportPayload, counts })).toThrow();
    });
  });

  describe('collision fields', () => {
    it('reads `passed` as a verdict at every level and as a count only under `counts`', () => {
      const parsed = ReportSchema.parse(reportPayload);
      const kit = parsed.kits[0];
      if (kit === undefined || 'error' in kit) throw new Error('expected a kit that ran');

      expect(parsed.passed).toBe(false);
      expect(parsed.counts.passed).toBe(2);
      expect(kit.passed).toBe(false);
      expect(kit.checklists[0]?.passed).toBe(false);
    });

    it('reads `warnings` as advisory entries at the top level and as a count only under `counts`', () => {
      const parsed = ReportSchema.parse(reportPayload);

      expect(parsed.warnings).toStrictEqual([
        { code: 'version-skew', message: 'kit is stale', remedy: 'Run `rdy compile` to refresh.' },
      ]);
      expect(parsed.counts.warnings).toBe(0);
    });

    it('rejects a numeric `warnings` at the top level, where the old flat shape put the count', () => {
      expect(() => ReportSchema.parse({ ...minimalReportPayload, warnings: 3 })).toThrow();
    });
  });

  describe('kit entries', () => {
    it('accepts a counts-free error entry', () => {
      const kits = [{ name: 'release', error: { code: 'config', message: 'boom' } }];

      expect(() => ReportSchema.parse({ ...minimalReportPayload, kits })).not.toThrow();
    });

    it('rejects a kit that carries neither results nor an error', () => {
      expect(() => ReportSchema.parse({ ...minimalReportPayload, kits: [{ name: 'orphan' }] })).toThrow();
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
