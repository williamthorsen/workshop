import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import { afterAll, describe, expect, it } from 'vitest';

import { buildSchemaDocuments, SCHEMA_BASE_URL, writeSchemaFiles } from '../../config/buildSchemas.ts';
import { isRecord } from '../../src/isRecord.ts';
import {
  compilePayload,
  errorEnvelopePayload,
  listPayload,
  minimalReportPayload,
  reportPayload,
  unknownWarningReportPayload,
  verifyPayload,
} from '../helpers/payloadFixtures.ts';

const documents = new Map(buildSchemaDocuments().map(({ fileName, document }) => [fileName, document]));

/** Look up a generated document by file name, failing loudly rather than returning undefined. */
function documentFor(fileName: string): Record<string, unknown> {
  const document = documents.get(fileName);
  if (document === undefined) throw new Error(`No generated schema named ${fileName}`);
  return document;
}

/** Read a nested object property, failing when the path does not lead to an object. */
function objectAt(root: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) throw new TypeError(`Expected an object at ${keys.join('.')}`);
    current = current[key];
  }
  if (!isRecord(current)) throw new TypeError(`Expected an object at ${keys.join('.')}`);
  return current;
}

/** Compile a generated document into a validator. */
function validatorFor(fileName: string): ValidateFunction {
  return new Ajv2020({ strict: true }).compile(documentFor(fileName));
}

describe('generated JSON Schemas', () => {
  it('emits one document per published payload', () => {
    expect(documents.keys().toArray()).toStrictEqual([
      'compile.v1.json',
      'error-envelope.v1.json',
      'list.v1.json',
      'report.v1.json',
      'verify.v1.json',
    ]);
  });

  it('gives each document an $id matching its published location', () => {
    for (const [fileName, document] of documents) {
      expect(document.$id).toBe(`${SCHEMA_BASE_URL}/${fileName}`);
    }
  });

  it('declares the draft each document is written against', () => {
    for (const document of documents.values()) {
      expect(document.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    }
  });

  describe('report document', () => {
    const report = documentFor('report.v1.json');

    it('requires exactly the fields every report carries', () => {
      expect(report.required).toStrictEqual([
        'schemaVersion',
        'readyupVersion',
        'passed',
        'counts',
        'detail',
        'durationMs',
        'kits',
      ]);
    });

    it('requires the effective thresholds on a kit that ran, where the top level leaves them optional', () => {
      expect(objectAt(report, '$defs', 'KitResultEntry').required).toContain('failOn');
      expect(objectAt(report, '$defs', 'KitResultEntry').required).toContain('reportOn');
    });

    it('publishes the warning vocabulary as an open set that still names its known codes', () => {
      const warningCode = objectAt(report, '$defs', 'WarningCode');

      expect(warningCode.anyOf).toStrictEqual([
        { type: 'string', enum: ['source-stale', 'target-drift', 'version-skew'] },
        { type: 'string' },
      ]);
    });

    it('requires all six buckets of the counts object', () => {
      expect(objectAt(report, '$defs', 'Counts').required).toStrictEqual([
        'passed',
        'errors',
        'warnings',
        'recommendations',
        'blocked',
        'optional',
      ]);
    });

    it('expresses the check tree as a self-reference rather than a fixed depth', () => {
      expect(objectAt(report, '$defs', 'CheckEntry', 'properties', 'checks', 'items').$ref).toBe('#/$defs/CheckEntry');
    });

    it('offers both kit-entry shapes as alternatives', () => {
      expect(objectAt(report, '$defs', 'KitEntry').anyOf).toStrictEqual([
        { $ref: '#/$defs/KitErrorEntry' },
        { $ref: '#/$defs/KitResultEntry' },
      ]);
    });

    it('leaves objects open so an added optional field does not invalidate the version', () => {
      expect(report).not.toHaveProperty('additionalProperties');
      expect(objectAt(report, '$defs', 'CheckEntry')).not.toHaveProperty('additionalProperties');
    });
  });

  describe('validating real payloads', () => {
    it.each([
      ['report.v1.json', reportPayload],
      ['report.v1.json', minimalReportPayload],
      // The forward-compatibility promise is made to a consumer running a JSON Schema validator, so
      // it has to be checked through one rather than through zod alone.
      ['report.v1.json', unknownWarningReportPayload],
      ['error-envelope.v1.json', errorEnvelopePayload],
      ['list.v1.json', listPayload],
      ['verify.v1.json', verifyPayload],
      ['compile.v1.json', compilePayload],
    ])('accepts a representative payload for %s', (fileName, payload) => {
      const validate = validatorFor(fileName);

      expect(validate(payload), JSON.stringify(validate.errors)).toBe(true);
    });

    it('rejects a report whose counts are still flat', () => {
      const { counts, ...withoutCounts } = minimalReportPayload;

      expect(validatorFor('report.v1.json')({ ...withoutCounts, ...counts })).toBe(false);
    });

    it('rejects a report carrying the old numeric warnings field', () => {
      expect(validatorFor('report.v1.json')({ ...minimalReportPayload, warnings: 2 })).toBe(false);
    });

    it('accepts a report carrying a field it has never heard of', () => {
      expect(validatorFor('report.v1.json')({ ...minimalReportPayload, addedLater: 'ok' })).toBe(true);
    });
  });

  describe('writing the files', () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'readyup-schemas-'));

    afterAll(() => {
      rmSync(outDir, { recursive: true, force: true });
    });

    it('writes every document as parseable JSON under the given directory', () => {
      const written = writeSchemaFiles(outDir);

      expect(written).toHaveLength(5);
      expect(readdirSync(outDir).toSorted()).toStrictEqual(documents.keys().toArray());
      for (const filePath of written) {
        expect(() => {
          JSON.parse(readFileSync(filePath, 'utf8'));
        }).not.toThrow();
      }
    });
  });
});
