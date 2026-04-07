import { meetsThreshold } from './runRdy.ts';
import type { JsonCheckEntry, JsonChecklistEntry, JsonReport, RdyReport, RdyResult, Severity } from './types.ts';

interface ChecklistEntry {
  name: string;
  report: RdyReport;
}

/** Options controlling which results appear in JSON output. */
export interface FormatJsonReportOptions {
  reportOn?: Severity;
}

/** Transform an array of checklist results into a JSON-serializable report string. */
export function formatJsonReport(entries: ChecklistEntry[], options?: FormatJsonReportOptions): string {
  const reportOn = options?.reportOn ?? 'recommend';
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  const checklists: JsonChecklistEntry[] = entries.map(({ name, report }) => {
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    // Filter results by reporting threshold.
    const visibleResults = report.results.filter((r) => meetsThreshold(r.severity, reportOn));

    // Count all visible results (flat count across all nesting levels).
    for (const result of visibleResults) {
      if (result.status === 'passed') passed++;
      else if (result.status === 'failed') failed++;
      else skipped++;
    }

    // Reconstruct tree from flat depth-first results.
    const { entries: checks } = buildCheckEntries(visibleResults, 0, 0);

    totalPassed += passed;
    totalFailed += failed;
    totalSkipped += skipped;

    return {
      name,
      allPassed: report.passed,
      durationMs: report.durationMs,
      passed,
      failed,
      skipped,
      checks,
    };
  });

  const totalDurationMs = checklists.reduce((sum, c) => sum + c.durationMs, 0);

  const output: JsonReport = {
    allPassed: entries.every(({ report }) => report.passed),
    passed: totalPassed,
    failed: totalFailed,
    skipped: totalSkipped,
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
