import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { CompileOutputSchema, SCHEMA_VERSION as COMPILE_VERSION } from '../src/schemas/compileOutputSchema.ts';
import { ErrorEnvelopeSchema, SCHEMA_VERSION as ENVELOPE_VERSION } from '../src/schemas/errorEnvelopeSchema.ts';
import { ListOutputSchema, SCHEMA_VERSION as LIST_VERSION } from '../src/schemas/listOutputSchema.ts';
import { ReportSchema, SCHEMA_VERSION as REPORT_VERSION } from '../src/schemas/reportSchema.ts';
import { SCHEMA_VERSION as VERIFY_VERSION, VerifyOutputSchema } from '../src/schemas/verifyOutputSchema.ts';

/** Where a published schema answers from once the package is on npm. */
export const SCHEMA_BASE_URL = 'https://unpkg.com/readyup/schemas';

/** One payload's published schema: what to call the file and what to put in it. */
export interface SchemaDocument {
  fileName: string;
  document: Record<string, unknown>;
}

/** A payload paired with the version it publishes under. */
interface Payload {
  name: string;
  version: number;
  schema: z.ZodType;
}

/**
 * The five published payloads.
 *
 * Each versions independently, so a change to the report leaves a consumer pinned to `list.v1.json`
 * untouched.
 */
const PAYLOADS: Payload[] = [
  { name: 'compile', version: COMPILE_VERSION, schema: CompileOutputSchema },
  { name: 'error-envelope', version: ENVELOPE_VERSION, schema: ErrorEnvelopeSchema },
  { name: 'list', version: LIST_VERSION, schema: ListOutputSchema },
  { name: 'report', version: REPORT_VERSION, schema: ReportSchema },
  { name: 'verify', version: VERIFY_VERSION, schema: VerifyOutputSchema },
];

/**
 * Render every payload as a JSON Schema document.
 *
 * Rendered in `input` mode, which leaves objects open. The evolution policy promises that adding an
 * optional field does not bump `schemaVersion`, and a closed schema would break that promise the
 * first time it was exercised: a consumer pinned to v1 would reject every payload carrying the new
 * field. No payload uses a transform or a default, so the input and output renderings are otherwise
 * the same document.
 */
export function buildSchemaDocuments(): SchemaDocument[] {
  return PAYLOADS.map(({ name, version, schema }) => {
    const fileName = `${name}.v${version}.json`;
    const { $schema, ...body } = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' });

    return { fileName, document: { $schema, $id: `${SCHEMA_BASE_URL}/${fileName}`, ...body } };
  });
}

/** Write every payload schema into `outDir`, creating it if needed, and return the paths written. */
export function writeSchemaFiles(outDir: string): string[] {
  mkdirSync(outDir, { recursive: true });

  return buildSchemaDocuments().map(({ fileName, document }) => {
    const filePath = path.join(outDir, fileName);
    writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`);
    return filePath;
  });
}
