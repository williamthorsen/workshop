import { layout } from './layout/engine.ts';
import type { TokenName } from './layout/formatter.ts';
import { resolveWorstToken } from './layout/layoutEngine.ts';
import { meetsThreshold } from './runRdy.ts';
import type { FixLocation, Progress, RdyReport, RdyResult, Severity, SummaryCounts } from './types.ts';
import { isPercentProgress } from './types.ts';
import { worseSeverity } from './utils/severity.ts';

/** Heading over the end-of-report fix recap. */
const FIXES_HEADING = 'Fixes';

/** A remediation message together with the check that raised it. */
interface AttributedFix {
  fix: string;
  name: string;
}

/** Options controlling how the report is formatted. */
export interface ReportRdyOptions {
  fixLocation?: FixLocation;
  quiet?: boolean;
  reportOn?: Severity;
}

/**
 * Format a readyup report as a human-readable string for terminal output.
 *
 * A failed check's line carries only its claim; the reason renders in a block beneath, indented to
 * the name column. In `end` mode (default) fixes are recapped at the bottom, each attributed to the
 * check that raised it; in `inline` mode the fix joins that check's reason block instead.
 *
 * Results below the reporting threshold are omitted from the detail tree unless they are an ancestor
 * of a result that is shown, and `quiet` drops passed checks from what survives that. The summary
 * counts always reflect the whole run regardless of either.
 */
export function reportRdy(report: RdyReport, options?: ReportRdyOptions): string {
  const fixLocation = options?.fixLocation ?? 'end';
  const reportOn = options?.reportOn ?? 'recommend';

  const visibleResults = selectReportedResults(report.results, reportOn, options?.quiet === true);
  const lines = visibleResults.flatMap((result) => renderResult(result, fixLocation));

  // The blank line separates the count line from the tree, so an empty tree needs none: the heading
  // above already supplies one, and a second would open a gap under every fully-hidden checklist.
  if (lines.length > 0) lines.push('');
  lines.push(layout.formatCountLine(countResults(report.results), report.durationMs));

  if (fixLocation === 'end') {
    const fixes = collectFixes(visibleResults);
    if (fixes.length > 0) {
      lines.push(...layout.formatHeading(FIXES_HEADING, 'section'), ...renderFixRecap(fixes));
    }
  }

  return lines.join('\n');
}

/** Create a zeroed `SummaryCounts` object. */
export function emptyCounts(): SummaryCounts {
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

/**
 * Count results by severity and skip reason.
 *
 * This is the only entry point for tallying a result list, and it expects the run's
 * complete results. The reporting threshold selects what is *displayed*; passing a
 * pre-filtered list here is what once made the human, table, and JSON counts disagree.
 */
export function countResults(results: RdyResult[]): SummaryCounts {
  const counts = emptyCounts();
  for (const r of results) {
    tallyResult(counts, r);
  }
  return counts;
}

/**
 * Selects the results a reporting threshold leaves visible, retaining the ancestors of every survivor.
 *
 * A result is visible when its own severity meets the threshold or when any of its descendants is visible, so a
 * surviving check is never rendered under a pruned parent.
 *
 * Visible results are returned in their original order.
 */
export function selectVisibleResults(results: RdyResult[], reportOn: Severity): RdyResult[] {
  return retainWithAncestors(results, (result) => meetsThreshold(result.severity, reportOn));
}

/** Aggregates `source` counts into `target` in place, propagating the worse severity. */
export function mergeCounts(target: SummaryCounts, source: SummaryCounts): void {
  target.passed += source.passed;
  target.errors += source.errors;
  target.warnings += source.warnings;
  target.recommendations += source.recommendations;
  target.blocked += source.blocked;
  target.optional += source.optional;
  target.worstSeverity = worseSeverity(target.worstSeverity, source.worstSeverity);
}

// -- Helpers --

/**
 * Selects what the detail tree shows: the severity threshold first, then `quiet` over what survives.
 *
 * The two are orthogonal -- one filters by severity, the other by status -- so they compose rather
 * than override. Both run through the same ancestor-retaining walk, which is what keeps a lone deep
 * failure reachable through its passed parents under either.
 */
function selectReportedResults(results: RdyResult[], reportOn: Severity, quiet: boolean): RdyResult[] {
  const reported = selectVisibleResults(results, reportOn);
  if (!quiet) return reported;
  return retainWithAncestors(reported, (result) => result.status !== 'passed');
}

/**
 * Filters results to those `isVisible` accepts, retaining the ancestors of every survivor.
 *
 * Assumes the contiguous depth-first ordering `runRdy` produces: a result's descendants are exactly
 * the run of deeper results that follows it. Retaining whole ancestor chains preserves that property,
 * so the output of one pass is valid input to the next.
 */
function retainWithAncestors(results: RdyResult[], isVisible: (result: RdyResult) => boolean): RdyResult[] {
  const visible: RdyResult[] = [];
  // Scanning right to left, the nearest visible result is a descendant exactly when it is deeper, so its
  // depth alone decides whether the current result must be retained as an ancestor.
  let nearestVisibleDepth = -Infinity;

  for (const result of results.toReversed()) {
    if (!isVisible(result) && nearestVisibleDepth <= result.depth) continue;
    visible.push(result);
    nearestVisibleDepth = result.depth;
  }

  return visible.toReversed();
}

/** Render one result: its check line, plus the reason block a failure carries beneath it. */
function renderResult(result: RdyResult, fixLocation: FixLocation): string[] {
  const isFailed = result.status === 'failed';
  const checkLine = layout.formatCheckLine({
    token: resolveResultToken(result),
    name: result.name,
    depth: result.depth,
    durationMs: result.durationMs,
    // A failed check's detail is its reason, which belongs in the block beneath rather than inline.
    ...(!isFailed && result.detail !== null && { detail: result.detail }),
    ...(result.progress !== null && { progress: formatProgress(result.progress) }),
  });

  if (!isFailed) return [checkLine];

  return [checkLine, ...layout.formatReasonBlock(collectReasons(result, fixLocation === 'inline'), result.depth)];
}

/**
 * Collect the reason lines beneath a failed check: the authored detail, then the thrown exception.
 *
 * A failure deriving from its children has neither, and so contributes no block at all -- the subtree
 * beneath it is already the explanation, and a restatement would only push the checks further apart.
 */
function collectReasons(result: RdyResult, includeFix: boolean): string[] {
  const reasons: string[] = [];
  if (result.detail !== null) reasons.push(result.detail);
  if (result.error !== null) reasons.push(`Error: ${result.error.message}`);
  if (includeFix && result.fix !== null) reasons.push(`${layout.token('fix')}${result.fix}`);
  return reasons;
}

/** Gather every fix a failed result carries, paired with the check name that attributes it. */
function collectFixes(results: RdyResult[]): AttributedFix[] {
  return results.flatMap((result) =>
    result.status === 'failed' && result.fix !== null ? [{ name: result.name, fix: result.fix }] : [],
  );
}

/** Render the end-of-report recap: the check name on the token line, its fix indented beneath. */
function renderFixRecap(fixes: AttributedFix[]): string[] {
  return fixes.flatMap((entry) => [`${layout.token('fix')}${entry.name}`, ...layout.formatReasonBlock([entry.fix])]);
}

/** Map a result's status, severity, and skip reason to the token that leads its line. */
function resolveResultToken(result: RdyResult): TokenName {
  if (result.status === 'passed') return 'passed';
  if (result.status === 'skipped') {
    return result.skipReason === 'precondition' ? 'blockedPrecondition' : 'skippedOptional';
  }
  // A failed check's severity picks its token by the same rule a tail line's worst severity does.
  return resolveWorstToken(result.severity);
}

/** Format a progress value for display. */
function formatProgress(progress: Progress): string {
  if (isPercentProgress(progress)) {
    return `${progress.percent}%`;
  }
  return `${progress.passedCount} of ${progress.count}`;
}

/**
 * Update a `SummaryCounts` object in place with the contribution of a single result.
 *
 * Passed results increment `passed`. Failed results are bucketed by severity, and
 * `worstSeverity` is updated if the failure is more severe than the current worst.
 * Skipped results increment `blocked` (precondition) or `optional` (n/a).
 */
function tallyResult(counts: SummaryCounts, result: RdyResult): void {
  if (result.status === 'passed') {
    counts.passed++;
    return;
  }
  if (result.status === 'failed') {
    if (result.severity === 'error') counts.errors++;
    else if (result.severity === 'warn') counts.warnings++;
    else counts.recommendations++;
    counts.worstSeverity = worseSeverity(counts.worstSeverity, result.severity);
    return;
  }
  if (result.skipReason === 'precondition') counts.blocked++;
  else counts.optional++;
}
