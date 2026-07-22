import { extractMessage } from './utils/error-handling.ts';

/**
 * Diagnosis of a failure that prevented rdy from completing an invocation.
 *
 * - `usage`: the invocation is malformed — an unknown flag, a missing value, an impossible
 *   combination of arguments.
 * - `config`: repo configuration or a kit manifest could not be read, written, or parsed.
 * - `kit-load`: a kit could not be resolved, fetched, or evaluated.
 * - `internal`: anything else — a defect in rdy or an unexpected environment failure.
 */
export type RdyErrorCode = 'config' | 'internal' | 'kit-load' | 'usage';

/** Optional fields accepted by every `RdyError` constructor and factory. */
export interface RdyErrorOptions {
  cause?: unknown;
}

/**
 * A failure that prevented rdy from completing the invocation.
 *
 * Every code maps to the same exit status, because the exit code answers "can I retry this
 * invocation?" while `code` carries the diagnosis.
 */
export class RdyError extends Error {
  readonly code: RdyErrorCode;

  constructor(code: RdyErrorCode, message: string, options: RdyErrorOptions = {}) {
    super(message, ...(options.cause === undefined ? [] : [{ cause: options.cause }]));
    this.name = 'RdyError';
    this.code = code;
  }
}

/** Build a `usage` error: the invocation itself is malformed. */
export function usageError(message: string, options?: RdyErrorOptions): RdyError {
  return new RdyError('usage', message, options);
}

/** Build a `config` error: repo configuration or a manifest could not be read or written. */
export function configError(message: string, options?: RdyErrorOptions): RdyError {
  return new RdyError('config', message, options);
}

/** Build a `kit-load` error: a kit could not be resolved, fetched, or evaluated. */
export function kitLoadError(message: string, options?: RdyErrorOptions): RdyError {
  return new RdyError('kit-load', message, options);
}

/** Build an `internal` error: a defect in rdy or an unexpected environment failure. */
export function internalError(message: string, options?: RdyErrorOptions): RdyError {
  return new RdyError('internal', message, options);
}

/**
 * Coerce an unknown thrown value into an `RdyError`.
 *
 * Anything not already classified is `internal`: escaping the command boundary undiagnosed
 * is itself the definition of a defect rather than a known failure mode.
 */
export function toRdyError(error: unknown): RdyError {
  if (error instanceof RdyError) return error;
  return internalError(extractMessage(error), { cause: error });
}
