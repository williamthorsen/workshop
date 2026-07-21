import type { RdyError } from './errors.ts';
import { SCHEMA_VERSION } from './schemaVersion.ts';

/**
 * Serialize a failed invocation as the single-line JSON error envelope.
 *
 * `remedy` is always present and may be empty; a consumer treats an empty string as
 * "no remediation text is available" rather than as a missing field.
 */
export function formatJsonError(error: RdyError): string {
  return JSON.stringify({
    error: { code: error.code, message: error.message, remedy: error.remedy },
    schemaVersion: SCHEMA_VERSION,
  });
}
