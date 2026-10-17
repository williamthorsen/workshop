import type { FailedResult, PassedResult, SkippedResult } from '../../kits/types.ts';

/** Builds a failed error-severity result named `check`, with any field overridden. */
export function makeFailedResult(overrides?: Partial<FailedResult>): FailedResult {
  return {
    name: 'check',
    id: null,
    status: 'failed',
    ok: false,
    severity: 'error',
    quiet: false,
    detail: null,
    fix: null,
    error: null,
    progress: null,
    examinedCount: null,
    durationMs: 5,
    depth: 0,
    ...overrides,
  };
}

/** Builds a passed error-severity result named `check`, with any field overridden. */
export function makePassedResult(overrides?: Partial<PassedResult>): PassedResult {
  return {
    name: 'check',
    id: null,
    status: 'passed',
    ok: true,
    severity: 'error',
    quiet: false,
    detail: null,
    error: null,
    progress: null,
    examinedCount: null,
    durationMs: 10,
    depth: 0,
    ...overrides,
  };
}

/** Builds a result named `check` that a failed precondition skipped, with any field overridden. */
export function makeSkippedResult(overrides?: Partial<SkippedResult>): SkippedResult {
  return {
    name: 'check',
    id: null,
    status: 'skipped',
    ok: null,
    severity: 'error',
    quiet: false,
    skipReason: 'precondition',
    detail: null,
    error: null,
    progress: null,
    examinedCount: null,
    durationMs: 0,
    depth: 0,
    ...overrides,
  };
}
