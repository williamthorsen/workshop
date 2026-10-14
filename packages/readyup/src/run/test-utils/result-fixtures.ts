import type { FailedResult, PassedResult, Severity, SkippedResult } from '../../kits/types.ts';

/** Builds a failed result at the given severity. */
export function makeFailedResult(name: string, severity: Severity): FailedResult {
  return {
    name,
    id: null,
    status: 'failed',
    ok: false,
    severity,
    quiet: false,
    detail: null,
    fix: null,
    error: null,
    progress: null,
    examinedCount: null,
    durationMs: 0,
    depth: 0,
  };
}

/** Builds a passed result at the given severity. */
export function makePassedResult(name: string, severity: Severity): PassedResult {
  return {
    name,
    id: null,
    status: 'passed',
    ok: true,
    severity,
    quiet: false,
    detail: null,
    error: null,
    progress: null,
    examinedCount: null,
    durationMs: 0,
    depth: 0,
  };
}

/** Builds a result skipped by a failed parent, at the given severity and depth. */
export function makeSkippedResult(name: string, severity: Severity, depth: number): SkippedResult {
  return {
    name,
    id: null,
    status: 'skipped',
    ok: null,
    skipReason: 'precondition',
    severity,
    quiet: false,
    detail: null,
    error: null,
    progress: null,
    examinedCount: null,
    durationMs: 0,
    depth,
  };
}
