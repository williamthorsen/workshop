import { performance } from 'node:perf_hooks';

import type {
  FailedResult,
  PassedResult,
  RdyCheck,
  RdyChecklist,
  RdyReport,
  RdyResult,
  RdyStagedChecklist,
  Severity,
  SkippedResult,
} from './types.ts';
import { isFlatChecklist } from './types.ts';

/** Options controlling failure and severity defaults for a run. */
export interface RunRdyOptions {
  defaultSeverity?: Severity;
  failOn?: Severity;
}

/**
 * Numeric rank for severity comparison. Lower rank = higher severity.
 *
 * A result "meets or exceeds" a threshold when its rank is <= the threshold's rank.
 */
const SEVERITY_RANK: Record<Severity, number> = {
  error: 0,
  warn: 1,
  recommend: 2,
};

/** Return true if `severity` is at or above (more severe than or equal to) `threshold`. */
export function meetsThreshold(severity: Severity, threshold: Severity): boolean {
  return SEVERITY_RANK[severity] <= SEVERITY_RANK[threshold];
}

/** Resolve the effective severity for a check. */
function resolveSeverity(check: RdyCheck, defaultSeverity: Severity): Severity {
  return check.severity ?? defaultSeverity;
}

/** Build a passed result. */
function buildPassedResult(
  name: string,
  severity: Severity,
  durationMs: number,
  detail: string | null,
  fix: string | null,
  progress: import('./types.ts').Progress | null,
  depth = 0,
): PassedResult {
  return { name, status: 'passed', ok: true, severity, detail, fix, error: null, progress, durationMs, depth };
}

/** Build a failed result. */
function buildFailedResult(
  name: string,
  severity: Severity,
  durationMs: number,
  detail: string | null,
  fix: string | null,
  error: Error | null,
  progress: import('./types.ts').Progress | null,
  depth = 0,
): FailedResult {
  return { name, status: 'failed', ok: false, severity, detail, fix, error, progress, durationMs, depth };
}

/** Build a skipped result. */
function buildSkippedResult(
  name: string,
  severity: Severity,
  skipReason: 'n/a' | 'precondition',
  detail: string | null,
  fix: string | null,
  depth = 0,
): SkippedResult {
  return {
    name,
    status: 'skipped',
    ok: null,
    severity,
    skipReason,
    detail,
    fix,
    error: null,
    progress: null,
    durationMs: 0,
    depth,
  };
}

/**
 * Execute a single check and recursively process its dependent checks.
 *
 * Returns the check's own result followed by all descendant results in depth-first order.
 */
async function executeCheck(check: RdyCheck, defaultSeverity: Severity, depth = 0): Promise<RdyResult[]> {
  const severity = resolveSeverity(check, defaultSeverity);
  const fix = check.fix ?? null;
  const children = check.checks ?? [];

  // Evaluate skip condition before running the check.
  if (check.skip !== undefined) {
    const start = performance.now();
    try {
      const skipResult = await check.skip();
      if (typeof skipResult === 'string') {
        const result = buildSkippedResult(check.name, severity, 'n/a', skipResult, fix, depth);
        const childResults = skipAllDescendants(children, defaultSeverity, 'n/a', depth + 1);
        return [result, ...childResults];
      }
    } catch (error_: unknown) {
      const durationMs = performance.now() - start;
      const error = error_ instanceof Error ? error_ : new Error(String(error_));
      const result = buildFailedResult(check.name, severity, durationMs, null, fix, error, null, depth);
      const childResults = skipAllDescendants(children, defaultSeverity, 'precondition', depth + 1);
      return [result, ...childResults];
    }
  }

  const start = performance.now();
  try {
    const raw = await check.check();
    const durationMs = performance.now() - start;
    let result: RdyResult;
    if (typeof raw === 'boolean') {
      result = raw
        ? buildPassedResult(check.name, severity, durationMs, null, fix, null, depth)
        : buildFailedResult(check.name, severity, durationMs, null, fix, null, null, depth);
    } else {
      const detail = raw.detail ?? null;
      const progress = raw.progress ?? null;
      result = raw.ok
        ? buildPassedResult(check.name, severity, durationMs, detail, fix, progress, depth)
        : buildFailedResult(check.name, severity, durationMs, detail, fix, null, progress, depth);
    }

    const childResults = await collectChildResults(result, children, defaultSeverity, depth + 1);
    return [result, ...childResults];
  } catch (error_: unknown) {
    const durationMs = performance.now() - start;
    const error = error_ instanceof Error ? error_ : new Error(String(error_));
    const result = buildFailedResult(check.name, severity, durationMs, null, fix, error, null, depth);
    const childResults = skipAllDescendants(children, defaultSeverity, 'precondition', depth + 1);
    return [result, ...childResults];
  }
}

/**
 * Collect results from child checks based on the parent's outcome.
 *
 * Passed parents: execute children concurrently, then iterate in declaration order
 * to produce depth-first results. Failed/skipped parents: skip all descendants.
 */
async function collectChildResults(
  parentResult: RdyResult,
  children: RdyCheck[],
  defaultSeverity: Severity,
  childDepth: number,
): Promise<RdyResult[]> {
  if (children.length === 0) return [];

  if (parentResult.status === 'failed') {
    return skipAllDescendants(children, defaultSeverity, 'precondition', childDepth);
  }

  if (parentResult.status === 'skipped') {
    const reason = parentResult.skipReason === 'n/a' ? 'n/a' : 'precondition';
    return skipAllDescendants(children, defaultSeverity, reason, childDepth);
  }

  return runSiblingChecks(children, defaultSeverity, childDepth);
}

/**
 * Run sibling checks concurrently, then collect results in depth-first declaration order.
 *
 * All siblings execute concurrently via `Promise.all`, but the returned array
 * preserves declaration order: each sibling's own result is followed by its
 * subtree before the next sibling appears.
 */
async function runSiblingChecks(checks: RdyCheck[], defaultSeverity: Severity, depth: number): Promise<RdyResult[]> {
  const siblingTrees = await Promise.all(checks.map((c) => executeCheck(c, defaultSeverity, depth)));
  return siblingTrees.flat();
}

/** Recursively skip a check and all its descendants. */
function skipAllDescendants(
  checks: RdyCheck[],
  defaultSeverity: Severity,
  skipReason: 'n/a' | 'precondition',
  depth: number,
): RdyResult[] {
  const results: RdyResult[] = [];
  for (const check of checks) {
    results.push(skipCheck(check, defaultSeverity, skipReason, depth));
    if (check.checks !== undefined && check.checks.length > 0) {
      results.push(...skipAllDescendants(check.checks, defaultSeverity, skipReason, depth + 1));
    }
  }
  return results;
}

/** Mark a check as skipped due to a failed precondition or N/A parent. */
function skipCheck(
  check: RdyCheck,
  defaultSeverity: Severity,
  skipReason: 'n/a' | 'precondition' = 'precondition',
  depth = 0,
): RdyResult {
  const severity = resolveSeverity(check, defaultSeverity);
  return buildSkippedResult(check.name, severity, skipReason, null, check.fix ?? null, depth);
}

/** Run preconditions concurrently. Return true if all passed. */
async function runPreconditions(
  preconditions: RdyCheck[],
  results: RdyResult[],
  defaultSeverity: Severity,
): Promise<boolean> {
  if (preconditions.length === 0) return true;

  const trees = await Promise.all(preconditions.map((c) => executeCheck(c, defaultSeverity)));
  const flat = trees.flat();
  results.push(...flat);

  // Only top-level precondition results (depth 0) determine pass/fail.
  return flat.filter((r) => r.depth === 0).every((r) => r.status === 'passed');
}

/** Run a flat checklist: all checks concurrently. */
async function runFlatChecks(
  checklist: RdyChecklist,
  results: RdyResult[],
  preconditionsPassed: boolean,
  defaultSeverity: Severity,
): Promise<void> {
  if (!preconditionsPassed) {
    results.push(...skipAllDescendants(checklist.checks, defaultSeverity, 'precondition', 0));
    return;
  }

  const checkResults = await runSiblingChecks(checklist.checks, defaultSeverity, 0);
  results.push(...checkResults);
}

/** Run a staged checklist: groups sequentially, checks within each group concurrently. */
async function runStagedChecks(
  checklist: RdyStagedChecklist,
  results: RdyResult[],
  preconditionsPassed: boolean,
  defaultSeverity: Severity,
  failOn: Severity,
): Promise<void> {
  if (!preconditionsPassed) {
    for (const group of checklist.groups) {
      results.push(...skipAllDescendants(group, defaultSeverity, 'precondition', 0));
    }
    return;
  }

  let shouldSkipRemaining = false;
  for (const group of checklist.groups) {
    if (shouldSkipRemaining) {
      results.push(...skipAllDescendants(group, defaultSeverity, 'precondition', 0));
      continue;
    }

    const groupResults = await runSiblingChecks(group, defaultSeverity, 0);
    results.push(...groupResults);

    // Only top-level group results (depth 0) determine whether to halt subsequent groups,
    // consistent with how precondition pass/fail uses only depth-0 results.
    const topLevelFailed = groupResults
      .filter((r) => r.depth === 0)
      .some((r) => r.status === 'failed' && meetsThreshold(r.severity, failOn));
    if (topLevelFailed) {
      shouldSkipRemaining = true;
    }
  }
}

/**
 * Run all checks in a checklist and produce a report.
 *
 * Preconditions run first. If any fails, all subsequent checks are skipped.
 * Flat checklists run all checks concurrently. Staged checklists run groups
 * sequentially, bailing on later groups when an earlier group has a failure
 * at or above the failure threshold.
 */
export async function runRdy(
  checklist: RdyChecklist | RdyStagedChecklist,
  options: RunRdyOptions = {},
): Promise<RdyReport> {
  const defaultSeverity = options.defaultSeverity ?? 'error';
  const failOn = options.failOn ?? 'error';
  const start = performance.now();
  const results: RdyResult[] = [];

  const preconditionsPassed = await runPreconditions(checklist.preconditions ?? [], results, defaultSeverity);

  await (isFlatChecklist(checklist)
    ? runFlatChecks(checklist, results, preconditionsPassed, defaultSeverity)
    : runStagedChecks(checklist, results, preconditionsPassed, defaultSeverity, failOn));

  const durationMs = performance.now() - start;

  // The run passes when no failed result has severity at or above the failure threshold.
  const passed = !results.some((r) => r.status === 'failed' && meetsThreshold(r.severity, failOn));

  return { results, passed, durationMs };
}
