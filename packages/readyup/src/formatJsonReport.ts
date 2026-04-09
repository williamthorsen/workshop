import { tallyResult } from './reportRdy.ts';
import { meetsThreshold } from './runRdy.ts';
import type {
  JsonCheckEntry,
  JsonChecklistEntry,
  JsonReport,
  RdyReport,
  RdyResult,
  Severity,
  SummaryCounts,
} from './types.ts';

interface ChecklistEntry {
  name: string;
  report: RdyReport;
}

/** Options controlling which results appear in JSON output. */
export interface FormatJsonReportOptions {
  reportOn?: Severity;
}

/** Create a zeroed `SummaryCounts` object. */
function emptyCounts(): SummaryCounts {
  return {
    passed: 0,
    errors: 0,
    warnings: 0,
    recommendations: 0,
    blocked: 0,
    optional: 0,
    worstSeverity: null,
  };
}

/** Return the more severe of two severity values. `error` > `warn` > `recommend` > `null`. */
function worseSeverity(current: Severity | null, candidate: Severity | null): Severity | null {
  if (current === 'error' || candidate === 'error') return 'error';
  if (current === 'warn' || candidate === 'warn') return 'warn';
  if (current === 'recommend' || candidate === 'recommend') return 'recommend';
  return null;
}

/** Transform an array of checklist results into a JSON-serializable report string. */
export function formatJsonReport(entries: ChecklistEntry[], options?: FormatJsonReportOptions): string {
  const reportOn = options?.reportOn ?? 'recommend';
  const totals = emptyCounts();

  const checklists: JsonChecklistEntry[] = entries.map(({ name, report }) => {
    const counts = emptyCounts();

    // Filter results by reporting threshold.
    const visibleResults = report.results.filter((r) => meetsThreshold(r.severity, reportOn));

    // Count all visible results (flat count across all nesting levels).
    for (const result of visibleResults) {
      tallyResult(counts, result);
    }

    // Reconstruct tree from flat depth-first results.
    const { entries: checks } = buildCheckEntries(visibleResults, 0, 0);

    totals.passed += counts.passed;
    totals.errors += counts.errors;
    totals.warnings += counts.warnings;
    totals.recommendations += counts.recommendations;
    totals.blocked += counts.blocked;
    totals.optional += counts.optional;
    totals.worstSeverity = worseSeverity(totals.worstSeverity, counts.worstSeverity);

    return {
      name,
      durationMs: report.durationMs,
      ...counts,
      checks,
    };
  });

  const totalDurationMs = checklists.reduce((sum, c) => sum + c.durationMs, 0);

  const output: JsonReport = {
    ...totals,
    durationMs: totalDurationMs,
    checklists,
  };

  return JSON.stringify(output);
}

/**
 * Reconstruct a tree of check entries from a flat depth-first results slice.
 *
 * Consumes results at `expectedDepth` as siblings, recursing into deeper results
 * as children. Returns the parsed entries and the index of the first unconsumed result.
 *
 * Assumes contiguous, monotonically increasing depths as produced by `runRdy`.
 * A depth gap (e.g., depth 0 followed by depth 2 with no depth 1) will silently
 * promote the deeper result to the nearest parent level.
 */
function buildCheckEntries(
  results: RdyResult[],
  startIndex: number,
  expectedDepth: number,
): { entries: JsonCheckEntry[]; nextIndex: number } {
  const entries: JsonCheckEntry[] = [];
  let index = startIndex;

  while (index < results.length) {
    const result = results[index];
    if (result === undefined) break;
    const depth = result.depth;

    // Stop when we encounter a result shallower than what we expect at this level.
    if (depth < expectedDepth) break;

    index++;

    // Recursively collect children (results at depth + 1 and deeper).
    const { entries: children, nextIndex } = buildCheckEntries(results, index, depth + 1);
    index = nextIndex;

    entries.push(buildCheckEntry(result, children));
  }

  return { entries, nextIndex: index };
}

/**
 * Build a single JSON check entry, normalizing the union to include all fields.
 *
 * Non-skipped results get `skipReason: null` for uniform JSON shape.
 * Error objects are serialized to their message string.
 */
function buildCheckEntry(result: RdyResult, children: JsonCheckEntry[] = []): JsonCheckEntry {
  const errorString = result.error !== null ? result.error.message : null;

  if (result.status === 'skipped') {
    return {
      name: result.name,
      status: result.status,
      ok: result.ok,
      severity: result.severity,
      skipReason: result.skipReason,
      detail: result.detail,
      fix: result.fix,
      error: errorString,
      progress: result.progress,
      durationMs: result.durationMs,
      checks: children,
    };
  }

  return {
    name: result.name,
    status: result.status,
    ok: result.ok,
    severity: result.severity,
    skipReason: null,
    detail: result.detail,
    fix: result.fix,
    error: errorString,
    progress: result.progress,
    durationMs: result.durationMs,
    checks: children,
  };
}
