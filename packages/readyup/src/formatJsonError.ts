import type { RdyError } from './errors.ts';

/** Serializes a failed invocation as the single-line JSON error envelope. */
export function formatJsonError(error: RdyError): string {
  return JSON.stringify({ error: { code: error.code, message: error.message } });
}
