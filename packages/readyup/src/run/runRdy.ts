import { performance } from 'node:perf_hooks';

import type {
  CheckOutcome,
  FailedResult,
  PassedResult,
  Progress,
  RdyCheck,
  RdyChecklist,
  RdyReport,
  RdyResult,
  RdyStagedChecklist,
  Severity,
  SkippedResult,
} from '../kits/types.ts';
import { isFlatChecklist } from '../kits/types.ts';
import { describeValue } from '../portable/describe-value.ts';
import { isRecord } from '../portable/isRecord.ts';
import { meetsThreshold } from '../severity/meetsThreshold.ts';

/** Options controlling failure and severity defaults for a run. */
export interface RunRdyOptions {
  defaultSeverity?: Severity;
  failOn?: Severity;
}

/**
 * Severity assigned to a check that is broken rather than failing.
 *
 * A `check` or `skip` function that throws, or that returns a value the runner cannot interpret, is
 * a defect in the check itself and not a soft finding, so it overrides whatever severity the check
 * declares.
 */
const AUTHORING_ERROR_SEVERITY: Severity = 'error';

/** Resolve the effective severity for a check. */
function resolveSeverity(check: RdyCheck, defaultSeverity: Severity): Severity {
  return check.severity ?? defaultSeverity;
}

/** The fields a check contributes to every result it can produce. */
interface CheckContext {
  name: string;
  severity: Severity;
  quiet: boolean;
  fix: string | null;
  depth: number;
}

/** Gather the fields a check contributes to every result it can produce. */
function buildCheckContext(check: RdyCheck, defaultSeverity: Severity, depth: number): CheckContext {
  return {
    name: check.name,
    severity: resolveSeverity(check, defaultSeverity),
    quiet: check.quiet ?? false,
    fix: check.fix ?? null,
    depth,
  };
}

/** Build a passed result. */
function buildPassedResult(
  fields: CheckContext & { detail: string | null; durationMs: number; progress: Progress | null },
): PassedResult {
  return { ...fields, status: 'passed', ok: true, error: null };
}

/** Build a failed result. */
function buildFailedResult(
  fields: CheckContext & {
    detail: string | null;
    durationMs: number;
    error: Error | null;
    progress: Progress | null;
  },
): FailedResult {
  return { ...fields, status: 'failed', ok: false };
}

/** Build a skipped result. */
function buildSkippedResult(
  fields: CheckContext & { detail: string | null; skipReason: 'n/a' | 'precondition' },
): SkippedResult {
  return { ...fields, status: 'skipped', ok: null, error: null, progress: null, durationMs: 0 };
}

/**
 * Build the result for a check that is broken rather than failing.
 *
 * The declared severity is overridden, because a check that never expressed a verdict says nothing
 * about the urgency of its subject.
 */
function buildAuthoringErrorResult(context: CheckContext, durationMs: number, error: Error): FailedResult {
  return buildFailedResult({
    ...context,
    severity: AUTHORING_ERROR_SEVERITY,
    detail: null,
    durationMs,
    error,
    progress: null,
  });
}

/**
 * Execute a single check and recursively process its dependent checks.
 *
 * Returns the check's own result followed by all descendant results in depth-first order.
 */
async function executeCheck(check: RdyCheck, defaultSeverity: Severity, depth = 0): Promise<RdyResult[]> {
  const context = buildCheckContext(check, defaultSeverity, depth);
  const children = check.checks ?? [];

  // Evaluate skip condition before running the check.
  if (check.skip !== undefined) {
    const start = performance.now();
    try {
      // Widened to `unknown`: a kit runs as JavaScript, so its functions return whatever their
      // author wrote, whatever the declared type promised.
      const skipResult: unknown = await check.skip();
      if (typeof skipResult === 'string') {
        // An `n/a` skip terminates its subtree: descendants produce no results at all.
        return [buildSkippedResult({ ...context, skipReason: 'n/a', detail: skipResult })];
      }
      if (skipResult !== false) {
        const error = new Error(
          `skip() returned ${describeValue(skipResult)}; expected false to run the check, or a reason string to skip it.`,
        );
        const result = buildAuthoringErrorResult(context, performance.now() - start, error);
        const childResults = skipAllDescendants(children, defaultSeverity, depth + 1);
        return [result, ...childResults];
      }
    } catch (error_: unknown) {
      const error = error_ instanceof Error ? error_ : new Error(String(error_));
      const result = buildAuthoringErrorResult(context, performance.now() - start, error);
      const childResults = skipAllDescendants(children, defaultSeverity, depth + 1);
      return [result, ...childResults];
    }
  }

  const start = performance.now();
  try {
    const raw: unknown = await check.check();
    const durationMs = performance.now() - start;
    let result: PassedResult | FailedResult;
    if (typeof raw === 'boolean') {
      result = raw
        ? buildPassedResult({ ...context, detail: null, durationMs, progress: null })
        : buildFailedResult({ ...context, detail: null, durationMs, error: null, progress: null });
    } else if (isCheckOutcome(raw)) {
      const detail = raw.detail ?? null;
      const progress = raw.progress ?? null;
      result = raw.ok
        ? buildPassedResult({ ...context, detail, durationMs, progress })
        : buildFailedResult({ ...context, detail, durationMs, error: null, progress });
    } else {
      // Reported as a defect rather than as an ordinary failure: the check never expressed a
      // verdict, so the severity it declared for its subject says nothing about this outcome.
      const error = new Error(
        `check() returned ${describeValue(raw)}; expected a boolean or an object with a boolean "ok" property.`,
      );
      result = buildAuthoringErrorResult(context, durationMs, error);
    }

    const childResults = await collectChildResults(result, children, defaultSeverity, depth + 1);
    return [result, ...childResults];
  } catch (error_: unknown) {
    const error = error_ instanceof Error ? error_ : new Error(String(error_));
    const result = buildAuthoringErrorResult(context, performance.now() - start, error);
    const childResults = skipAllDescendants(children, defaultSeverity, depth + 1);
    return [result, ...childResults];
  }
}

/**
 * Collect results from child checks based on the parent's outcome.
 *
 * Passed parents: execute children concurrently, then iterate in declaration order
 * to produce depth-first results. Failed parents: skip all descendants.
 */
async function collectChildResults(
  parentResult: PassedResult | FailedResult,
  children: RdyCheck[],
  defaultSeverity: Severity,
  childDepth: number,
): Promise<RdyResult[]> {
  if (children.length === 0) return [];

  if (parentResult.status === 'failed') {
    return skipAllDescendants(children, defaultSeverity, childDepth);
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

/**
 * Recursively skip a check and all its descendants.
 *
 * Every skip produced here is a `precondition` skip: an `n/a` skip terminates its own
 * subtree in `executeCheck` and so never reaches this function.
 */
function skipAllDescendants(checks: RdyCheck[], defaultSeverity: Severity, depth: number): RdyResult[] {
  const results: RdyResult[] = [];
  for (const check of checks) {
    results.push(skipCheck(check, defaultSeverity, depth));
    if (check.checks !== undefined && check.checks.length > 0) {
      results.push(...skipAllDescendants(check.checks, defaultSeverity, depth + 1));
    }
  }
  return results;
}

/** Mark a check as skipped because a precondition or ancestor check failed. */
function skipCheck(check: RdyCheck, defaultSeverity: Severity, depth: number): RdyResult {
  const context = buildCheckContext(check, defaultSeverity, depth);
  return buildSkippedResult({ ...context, skipReason: 'precondition', detail: null });
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

  // Only top-level precondition results (depth 0) determine pass/fail. A precondition
  // skipped `n/a` does not gate: "the gate does not apply" is not "the gate failed".
  return flat.filter((r) => r.depth === 0).every((r) => r.status !== 'failed');
}

/** Run a flat checklist: all checks concurrently. */
async function runFlatChecks(
  checklist: RdyChecklist,
  results: RdyResult[],
  preconditionsPassed: boolean,
  defaultSeverity: Severity,
): Promise<void> {
  if (!preconditionsPassed) {
    results.push(...skipAllDescendants(checklist.checks, defaultSeverity, 0));
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
      results.push(...skipAllDescendants(group, defaultSeverity, 0));
    }
    return;
  }

  let shouldSkipRemaining = false;
  for (const group of checklist.groups) {
    if (shouldSkipRemaining) {
      results.push(...skipAllDescendants(group, defaultSeverity, 0));
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
 * Preconditions run first. If any fails, all subsequent checks are skipped; a precondition
 * skipped `n/a` does not gate the checklist.
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
  const passed = results.every((r) => !(r.status === 'failed' && meetsThreshold(r.severity, failOn)));

  return { results, passed, durationMs };
}

/**
 * Return true if a check's return value is a structured outcome.
 *
 * `ok` must be a boolean: a truthy value of any other type is an authoring mistake, not a pass, and
 * treating it as one is how a broken check reports success.
 */
function isCheckOutcome(raw: unknown): raw is CheckOutcome {
  return isRecord(raw) && typeof raw['ok'] === 'boolean';
}
