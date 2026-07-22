import type { RdyError } from './errors.ts';
import { SCHEMA_VERSION } from './schemas/errorEnvelopeSchema.ts';
import type { JsonErrorEnvelope } from './schemas/index.ts';

/** Serializes a failed invocation as the single-line JSON error envelope. */
export function formatJsonError(error: RdyError): string {
  const envelope: JsonErrorEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    error: { code: error.code, message: error.message },
  };
  return JSON.stringify(envelope);
}
