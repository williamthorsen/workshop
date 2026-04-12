import { tallyResult } from './reportRdy.ts';
import { meetsThreshold } from './runRdy.ts';
import type {
  JsonCheckEntry,
  JsonChecklistEntry,
  JsonKitEntry,
  JsonReport,
  RdyReport,
  RdyResult,
  Severity,
  SummaryCounts,
} from './types.ts';
import { worseSeverity } from './utils/severity.ts';

interface ChecklistEntry {
  name: string;
  report: RdyReport;
}

interface KitInput {
  name: string;
  entries: ChecklistEntry[];
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

/** Aggregate `source` counts into `target` in place. */
function mergeCounts(target: SummaryCounts, source: SummaryCounts): void {
  target.passed += source.passed;
  target.errors += source.errors;
  target.warnings += source.warnings;
  target.recommendations += source.recommendations;
  target.blocked += source.blocked;
  target.optional += source.optional;
  target.worstSeverity = worseSeverity(target.worstSeverity, source.worstSeverity);
}

/** Build a single checklist entry from a name and report. */
function buildChecklistEntry(name: string, report: RdyReport, reportOn: Severity): JsonChecklistEntry {
  const counts = emptyCounts();
  const visibleResults = report.results.filter((r) => meetsThreshold(r.severity, reportOn));

  for (const result of visibleResults) {
    tallyResult(counts, result);
  }

  const { entries: checks } = buildCheckEntries(visibleResults, 0, 0);

  return {
    name,
    durationMs: report.durationMs,
    ...counts,
    checks,
  };
}

/** Transform kit-grouped checklist results into a JSON-serializable report string. */
export function formatJsonReport(kitInputs: KitInput[], options?: FormatJsonReportOptions): string {
  const reportOn = options?.reportOn ?? 'recommend';
  const totals = emptyCounts();

  const kits: JsonKitEntry[] = kitInputs.map(({ name, entries }) => {
    const kitCounts = emptyCounts();
    const checklists: JsonChecklistEntry[] = entries.map(({ name: checklistName, report }) => {
      const entry = buildChecklistEntry(checklistName, report, reportOn);
      mergeCounts(kitCounts, entry);
      return entry;
    });

    const kitDurationMs = checklists.reduce((sum, c) => sum + c.durationMs, 0);
    mergeCounts(totals, kitCounts);

    return {
      name,
      durationMs: kitDurationMs,
      ...kitCounts,
      checklists,
    };
  });

  const totalDurationMs = kits.reduce((sum, k) => sum + k.durationMs, 0);

  const output: JsonReport = {
    ...totals,
    durationMs: totalDurationMs,
    kits,
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
  const skipReason = result.status === 'skipped' ? result.skipReason : null;

  return {
    name: result.name,
    status: result.status,
    ok: result.ok,
    severity: result.severity,
    skipReason,
    detail: result.detail,
    fix: result.fix,
    error: errorString,
    progress: result.progress,
    durationMs: result.durationMs,
    checks: children,
  };
}
