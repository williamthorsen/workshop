import type { RdyError } from './errors.ts';
import { type JsonErrorEnvelope, SCHEMA_VERSION } from './schemas/errorEnvelopeSchema.ts';

/** Serializes a failed invocation as the single-line JSON error envelope. */
export function formatJsonError(error: RdyError): string {
  const envelope: JsonErrorEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    error: { code: error.code, message: error.message, ...(error.hint !== undefined && { hint: error.hint }) },
  };
  return JSON.stringify(envelope);
}
