import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import { afterAll, describe, expect, it } from 'vitest';

import { isRecord } from '../../isRecord.ts';
import { buildSchemaDocuments, SCHEMA_BASE_URL, writeSchemaFiles } from '../buildSchemas.ts';
import {
  compilePayload,
  errorEnvelopePayload,
  hintedErrorEnvelopePayload,
  listPayload,
  minimalReportPayload,
  reportPayload,
  unknownWarningReportPayload,
  verifyPayload,
} from './fixtures/payloadFixtures.ts';

const documents = new Map(buildSchemaDocuments().map(({ fileName, document }) => [fileName, document]));

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
      expect(document).toMatchObject({ $id: `${SCHEMA_BASE_URL}/${fileName}` });
    }
  });

  it('declares the draft each document is written against', () => {
    for (const document of documents.values()) {
      expect(document).toMatchObject({ $schema: 'https://json-schema.org/draft/2020-12/schema' });
    }
  });

  describe('report document', () => {
    const report = documentFor('report.v1.json');

    it('requires exactly the fields every report carries', () => {
      expect(valueAt(report, 'required')).toStrictEqual([
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
      expect(valueAt(report, '$defs', 'KitResultEntry', 'required')).toContain('failOn');
      expect(valueAt(report, '$defs', 'KitResultEntry', 'required')).toContain('reportOn');
    });

    it('publishes the warning vocabulary as an open set that still names its known codes', () => {
      expect(valueAt(report, '$defs', 'WarningCode', 'anyOf')).toStrictEqual([
        { type: 'string', enum: ['source-stale', 'target-drift'] },
        { type: 'string' },
      ]);
    });

    it('requires all six buckets of the counts object', () => {
      expect(valueAt(report, '$defs', 'Counts', 'required')).toStrictEqual([
        'passed',
        'errors',
        'warnings',
        'recommendations',
        'blocked',
        'optional',
      ]);
    });

    it('expresses the check tree as a self-reference rather than a fixed depth', () => {
      expect(valueAt(report, '$defs', 'CheckEntry', 'properties', 'checks', 'items', '$ref')).toBe(
        '#/$defs/CheckEntry',
      );
    });

    it('offers both kit-entry shapes as alternatives', () => {
      expect(valueAt(report, '$defs', 'KitEntry', 'anyOf')).toStrictEqual([
        { $ref: '#/$defs/KitErrorEntry' },
        { $ref: '#/$defs/KitResultEntry' },
      ]);
    });

    it('leaves objects open so an added optional field does not invalidate the version', () => {
      expect(report).not.toHaveProperty('additionalProperties');
      expect(objectAt(report, '$defs', 'CheckEntry')).not.toHaveProperty('additionalProperties');
    });
  });

  describe('error-envelope document', () => {
    const envelope = documentFor('error-envelope.v1.json');

    it('publishes the hint as an optional field, which is what keeps the version at 1', () => {
      expect(objectAt(envelope, '$defs', 'ErrorBody', 'properties', 'hint')).toStrictEqual({ type: 'string' });
      expect(valueAt(envelope, '$defs', 'ErrorBody', 'required')).toStrictEqual(['code', 'message']);
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
      ['error-envelope.v1.json', hintedErrorEnvelopePayload],
      ['list.v1.json', listPayload],
      ['verify.v1.json', verifyPayload],
      ['compile.v1.json', compilePayload],
    ])('accepts a representative payload for %s', (fileName, payload) => {
      const validate = validatorFor(fileName);

      expect(validate(payload)).toBe(true);
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

// region | Helpers

/** Looks up a generated document by file name, failing loudly rather than returning undefined. */
function documentFor(fileName: string): Record<string, unknown> {
  const document = documents.get(fileName);
  if (document === undefined) throw new Error(`No generated schema named ${fileName}`);
  return document;
}

/** Reads a nested object property, failing when the path does not lead to an object. */
function objectAt(root: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  const value = valueAt(root, ...keys);
  if (!isRecord(value)) throw new TypeError(`Expected an object at ${keys.join('.')}`);
  return value;
}

/** Compiles a generated document into a validator. */
function validatorFor(fileName: string): ValidateFunction {
  return new Ajv2020({ strict: true }).compile(documentFor(fileName));
}

/** Reads a nested value, failing when the path runs through anything but an object. */
function valueAt(root: Record<string, unknown>, ...keys: string[]): unknown {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) throw new TypeError(`Expected an object at ${keys.join('.')}`);
    current = current[key];
  }
  return current;
}

// endregion | Helpers
