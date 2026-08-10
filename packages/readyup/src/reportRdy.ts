import { getLayout } from './layout/engine.ts';
import type { TokenName } from './layout/formatter.ts';
import { resolveWorstToken } from './layout/layoutEngine.ts';
import { meetsThreshold } from './runRdy.ts';
import type { FixLocation, Progress, RdyReport, RdyResult, Severity, SummaryCounts } from './types.ts';
import { isPercentProgress } from './types.ts';
import { worseSeverity } from './utils/severity.ts';

const FIXES_HEADING = 'Fixes';

interface AttributedFix {
  fix: string;
  name: string;
  severity: Severity;
}

/** A rendered report, alongside whether its check tree rendered anything at all. */
export interface RenderedReport {
  body: string;
  hasVisibleResults: boolean;
}

/** Options controlling how the report is formatted. */
export interface ReportRdyOptions {
  fixLocation?: FixLocation;
  quiet?: boolean;
  reportOn?: Severity;
}

/**
 * Returns a report rendered for a terminal: a tree of check lines, any fix recap, then the count line.
 *
 * A failed check contributes its claim plus a reason block; every other status contributes one line.
 * `fixLocation` places each fix either in the recap or in its check's reason block. The count line
 * tallies every result in `report`, including those `reportOn` and `quiet` omit from the tree, and it
 * closes the block: the last line a reader meets before the blank parting one block from the next.
 *
 * Reports whether the tree rendered anything, so a caller placing the block in a sequence can decide
 * whether a report that is nothing but its count line has earned its place there.
 */
export function reportRdy(report: RdyReport, options?: ReportRdyOptions): RenderedReport {
  const fixLocation = options?.fixLocation ?? 'end';
  const reportOn = options?.reportOn ?? 'recommend';

  const visibleResults = selectReportedResults(report.results, reportOn, options?.quiet === true);
  const lines = visibleResults.flatMap((result) => renderResult(result, fixLocation));

  if (fixLocation === 'end') {
    const fixes = collectFixes(visibleResults);
    if (fixes.length > 0) {
      lines.push(getLayout().formatHeading(FIXES_HEADING, 'section'), ...renderFixRecap(fixes));
    }
  }

  const countLine = getLayout().formatCountLine(countResults(report.results), report.durationMs);

  return { body: [...lines, countLine].join('\n'), hasVisibleResults: lines.length > 0 };
}

/** Returns counts with every field at zero and no worst severity. */
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
 * Returns the tally of `results` by severity and skip reason.
 *
 * Expects a run's complete results: a pre-filtered list yields counts that describe only the subset.
 */
export function countResults(results: RdyResult[]): SummaryCounts {
  const counts = emptyCounts();
  for (const r of results) {
    tallyResult(counts, r);
  }
  return counts;
}

/**
 * Returns the results whose severity meets `reportOn`, plus the ancestors of each, in their original order.
 *
 * A result also survives when one of its descendants does, so no survivor is left without its parents.
 */
export function selectVisibleResults(results: RdyResult[], reportOn: Severity): RdyResult[] {
  return retainWithAncestors(results, (result) => meetsThreshold(result.severity, reportOn));
}

/** Adds `source` into `target` in place, keeping the worse of their two severities. */
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
 * Returns the results surviving `reportOn`, then those surviving quiet, each pass keeping ancestors.
 *
 * A pass drops out when the invocation asked to be quiet or when the check declared itself quiet. The
 * two are one predicate at two scopes, which is what makes a kit whose every check is quiet render
 * exactly what `--quiet` renders.
 */
function selectReportedResults(results: RdyResult[], reportOn: Severity, quiet: boolean): RdyResult[] {
  const reported = selectVisibleResults(results, reportOn);
  return retainWithAncestors(reported, (result) => result.status !== 'passed' || !(quiet || result.quiet));
}

/**
 * Returns the results `isVisible` accepts, plus the ancestors of each, in their original order.
 *
 * Requires depth-first order, where a result's descendants are the run of deeper results following it.
 * The returned list preserves that order, so it is valid input to a further pass.
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

/** Returns a result's check line, followed by its reason block when the result failed. */
function renderResult(result: RdyResult, fixLocation: FixLocation): string[] {
  const isFailed = result.status === 'failed';
  const checkLine = getLayout().formatCheckLine({
    token: resolveResultToken(result),
    name: result.name,
    depth: result.depth,
    durationMs: result.durationMs,
    // A failed check's detail is its reason, which the block beneath carries.
    ...(!isFailed && result.detail !== null && { detail: result.detail }),
    ...(result.progress !== null && { progress: formatProgress(result.progress) }),
  });

  if (!isFailed) return [checkLine];

  return [checkLine, ...getLayout().formatReasonBlock(collectReasons(result, fixLocation === 'inline'), result.depth)];
}

/**
 * Returns a failed result's reasons in reading order: its detail, its error, then its fix.
 *
 * Each is present only when the result carries it, so a result carrying none yields an empty list.
 */
function collectReasons(result: RdyResult, includeFix: boolean): string[] {
  const reasons: string[] = [];
  if (result.detail !== null) reasons.push(result.detail);
  if (result.error !== null) reasons.push(`Error: ${result.error.message}`);
  if (includeFix && result.fix !== null) reasons.push(formatFixReason(result.fix));
  return reasons;
}

/** Returns each failed result's fix paired with the name and severity of the check carrying it. */
function collectFixes(results: RdyResult[]): AttributedFix[] {
  return results.flatMap((result) =>
    result.status === 'failed' && result.fix !== null
      ? [{ fix: result.fix, name: result.name, severity: result.severity }]
      : [],
  );
}

/** Returns a fix as one reason line, behind the token marking fix text wherever a kit places it. */
function formatFixReason(fix: string): string {
  return `${getLayout().token('fix')}${fix}`;
}

/**
 * Returns each fix as its failed check re-rendered, the fix standing where the reason would.
 *
 * A recapped fix and an inline one are then one shape, so the fix token marks fix text under either
 * `fixLocation` rather than marking the check's name in the recap and the fix itself inline.
 */
function renderFixRecap(fixes: AttributedFix[]): string[] {
  return fixes.flatMap((entry) => [
    getLayout().formatCheckLine({ token: resolveWorstToken(entry.severity), name: entry.name }),
    ...getLayout().formatReasonBlock([formatFixReason(entry.fix)]),
  ]);
}

/** Returns the token for a result, chosen by its status and then by its severity or skip reason. */
function resolveResultToken(result: RdyResult): TokenName {
  if (result.status === 'passed') return 'passed';
  if (result.status === 'skipped') {
    return result.skipReason === 'precondition' ? 'blockedPrecondition' : 'skippedOptional';
  }
  // A failed check's severity picks its token by the same rule a tail line's worst severity does.
  return resolveWorstToken(result.severity);
}

/** Returns a progress value as a percentage or a passed-of-total fraction. */
function formatProgress(progress: Progress): string {
  if (isPercentProgress(progress)) {
    return `${progress.percent}%`;
  }
  return `${progress.passedCount} of ${progress.count}`;
}

/**
 * Adds one result to `counts` in place.
 *
 * A pass increments `passed`; a failure increments its severity's field and may raise `worstSeverity`;
 * a skip increments `blocked` or `optional` according to its reason.
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
