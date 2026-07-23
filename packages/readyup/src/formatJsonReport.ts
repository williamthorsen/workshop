import { countResults, emptyCounts, mergeCounts, selectVisibleResults } from './reportRdy.ts';
import type {
  JsonCheckEntry,
  JsonChecklistEntry,
  JsonCounts,
  JsonDetail,
  JsonKitEntry,
  JsonKitErrorEntry,
  JsonKitResultEntry,
  JsonReport,
  JsonWarning,
} from './schemas/index.ts';
import { SCHEMA_VERSION } from './schemas/reportSchema.ts';
import type { RdyReport, RdyResult, Severity, SummaryCounts } from './types.ts';
import { VERSION } from './version.ts';

interface ChecklistEntry {
  name: string;
  report: RdyReport;
}

/**
 * Input for a kit that ran, carrying the reports its checklists produced and the thresholds that
 * governed them.
 *
 * The thresholds travel with the kit rather than with the run, because a kit may declare its own and
 * the caller has already resolved the cascade by the time it gets here.
 */
export interface KitResultInput {
  name: string;
  entries: ChecklistEntry[];
  failOn: Severity;
  reportOn: Severity;
}

/**
 * Input for one kit, discriminated by the presence of `error`.
 *
 * A failed kit is described by the entry it serializes to, because it passes through verbatim.
 * Failures arrive interleaved rather than appended so kits keep the order they were requested in.
 */
export type KitInput = JsonKitErrorEntry | KitResultInput;

/**
 * The run settings the report echoes back, plus anything it must carry alongside results.
 *
 * `failOn` and `reportOn` are what the invocation requested, so each is absent when its flag was not
 * given: a default echoed as though it had been asked for is what made a kit's own threshold
 * impossible to recover from the payload. `detail` has no per-kit form, so it is always resolved.
 */
export interface FormatJsonReportOptions {
  failOn?: Severity;
  reportOn?: Severity;
  detail: JsonDetail;
  warnings?: JsonWarning[];
}

/**
 * A kit that ran, paired with the unrounded figures the report aggregates from it.
 *
 * The entry's own `durationMs` is already rounded for the wire; totals are summed from the raw value
 * so a run of many short kits does not accumulate one rounding error per kit.
 */
interface AggregatedKit {
  entry: JsonKitResultEntry;
  counts: SummaryCounts;
  durationMs: number;
}

/** Transform kit-grouped checklist results into a JSON-serializable report string. */
export function formatJsonReport(kitInputs: KitInput[], options: FormatJsonReportOptions): string {
  const { failOn, reportOn, detail, warnings } = options;
  const kits: JsonKitEntry[] = [];
  const aggregates: AggregatedKit[] = [];

  for (const input of kitInputs) {
    // A kit that never ran contributes nothing to the totals, so they cover only the kits that did.
    if ('error' in input) {
      kits.push(input);
      continue;
    }
    const aggregate = aggregateKit(input, detail);
    kits.push(aggregate.entry);
    aggregates.push(aggregate);
  }

  const totals = emptyCounts();
  let totalDurationMs = 0;
  for (const aggregate of aggregates) {
    mergeCounts(totals, aggregate.counts);
    totalDurationMs += aggregate.durationMs;
  }

  // A kit that never ran leaves the run incomplete, which the verdict must reflect even when
  // everything that did run passed.
  const everyKitRan = aggregates.length === kits.length;

  const report: JsonReport = {
    schemaVersion: SCHEMA_VERSION,
    readyupVersion: VERSION,
    passed: everyKitRan && aggregates.every(({ entry }) => entry.passed),
    ...splitCounts(totals),
    ...(failOn !== undefined && { failOn }),
    ...(reportOn !== undefined && { reportOn }),
    detail,
    durationMs: Math.round(totalDurationMs),
    ...(warnings !== undefined && warnings.length > 0 && { warnings }),
    kits,
  };

  return JSON.stringify(report);
}

/** Build one kit's entry and the raw figures the report aggregates from it. */
function aggregateKit(input: KitResultInput, detail: JsonDetail): AggregatedKit {
  const counts = emptyCounts();
  let durationMs = 0;

  const checklists: JsonChecklistEntry[] = input.entries.map(({ name, report }) => {
    const checklistCounts = countResults(report.results);
    mergeCounts(counts, checklistCounts);
    durationMs += report.durationMs;

    return {
      name,
      passed: report.passed,
      ...splitCounts(checklistCounts),
      durationMs: Math.round(report.durationMs),
      ...buildDetailTree(report.results, input.reportOn, detail),
    };
  });

  const entry: JsonKitResultEntry = {
    name: input.name,
    passed: checklists.every((checklist) => checklist.passed),
    ...splitCounts(counts),
    failOn: input.failOn,
    reportOn: input.reportOn,
    durationMs: Math.round(durationMs),
    checklists,
  };

  return { entry, counts, durationMs };
}

/**
 * Split the runner's internal tally into the wire shape: six numbers under `counts`, worst severity
 * beside them.
 *
 * `worstSeverity` is derived verdict data rather than a count, so it sits outside the object it
 * summarizes; a run that failed nothing has no worst severity and omits the field.
 */
function splitCounts(counts: SummaryCounts): { counts: JsonCounts; worstSeverity?: Severity } {
  const { worstSeverity, ...numeric } = counts;
  return worstSeverity === null ? { counts: numeric } : { counts: numeric, worstSeverity };
}

/**
 * Build the `checks` property for a checklist entry, or nothing when the projection leaves it empty.
 *
 * The reporting threshold prunes first and the detail projection second, so `summary` shows the same
 * failures `full` would — just without the checks that passed around them.
 */
function buildDetailTree(results: RdyResult[], reportOn: Severity, detail: JsonDetail): { checks?: JsonCheckEntry[] } {
  const visibleResults = selectVisibleResults(results, reportOn);
  const checks =
    detail === 'summary' ? buildSummaryEntries(visibleResults) : buildCheckEntries(visibleResults, 0, 0).entries;
  return checks.length > 0 ? { checks } : {};
}

/**
 * Project visible results down to what `--detail summary` carries: the failures and their remedies.
 *
 * Nesting is dropped along with the checks that passed, because what survives is a work list rather
 * than a trace of the run — the caller wants what to fix, and `full` remains one flag away.
 */
function buildSummaryEntries(results: RdyResult[]): JsonCheckEntry[] {
  return results
    .filter((result) => result.status === 'failed')
    .map((result) => {
      const entry: JsonCheckEntry = {
        name: result.name,
        status: result.status,
        ok: result.ok,
        severity: result.severity,
        durationMs: Math.round(result.durationMs),
      };
      if (result.fix !== null) entry.fix = result.fix;
      return entry;
    });
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
 * Build a single JSON check entry, omitting every field that carries nothing.
 *
 * A field is present only when it holds information the consumer could act on: no `null` placeholders,
 * no empty `checks` array, and no `fix` on a check that has nothing to remediate. Durations are whole
 * milliseconds, since sub-millisecond precision on a check that took 3ms describes only the scheduler.
 */
function buildCheckEntry(result: RdyResult, children: JsonCheckEntry[]): JsonCheckEntry {
  const entry: JsonCheckEntry = {
    name: result.name,
    status: result.status,
    ok: result.ok,
    severity: result.severity,
    durationMs: Math.round(result.durationMs),
  };

  if (result.status === 'skipped') entry.skipReason = result.skipReason;
  if (result.detail !== null) entry.detail = result.detail;
  if (result.status === 'failed' && result.fix !== null) entry.fix = result.fix;
  if (result.error !== null) entry.error = result.error.message;
  if (result.progress !== null) entry.progress = result.progress;
  if (children.length > 0) entry.checks = children;

  return entry;
}
