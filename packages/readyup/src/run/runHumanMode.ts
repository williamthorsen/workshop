import path from 'node:path';
import process from 'node:process';

import { EXIT_OK } from '../bin/exitCodes.ts';
import { toRdyError } from '../errors/RdyError.ts';
import { formatRepositoryLabel, type KitProvenance } from '../kits/KitProvenance.ts';
import type { FixLocation, RdyChecklist, RdyKit, RdyReport, RdyStagedChecklist, Severity } from '../kits/types.ts';
import { getLayout } from '../layout/engine.ts';
import type { BreadcrumbSegment, SummaryRow } from '../layout/layoutEngine.ts';
import type { RemoteFetchContext } from '../remote/createRemoteFetchContext.ts';
import { formatCombinedSummary } from '../reporting/formatCombinedSummary.ts';
import { formatRunVerdict, type KitThreshold, type WithheldFailures } from '../reporting/formatRunVerdict.ts';
import { countResults, emptyCounts, reportRdy, selectVisibleResults } from '../reporting/reportRdy.ts';
import { meetsThreshold } from '../severity/meetsThreshold.ts';
import { warnOnUnmarkedGeneratedSources } from './generated-report.ts';
import { readManifestTracking, warnOnKitStaleness } from './kit-staleness.ts';
import type { UnrunSource } from './KitSelection.ts';
import { loadKit } from './loadKit.ts';
import { warnOnUnusedPragmas } from './pragma-report.ts';
import { createPragmaLedger, type PragmaLedger } from './PragmaLedger.ts';
import { recordKitCheckIds } from './recordKitCheckIds.ts';
import type { ResolvedKitEntry } from './ResolvedKitEntry.ts';
import { resolveRunExitCode } from './resolveRunExitCode.ts';
import { resolveThresholds } from './resolveThresholds.ts';
import { runRdy } from './runRdy.ts';
import { selectChecklists } from './selectChecklists.ts';
import { warnOnMaskedSkips } from './skip-diagnosis.ts';
import { formatEmptySelection, warnOnUnrunSources } from './source-report.ts';
import { warnOnVersionSkew } from './version-skew.ts';

/** The line under the heading of a kit that did not load, whose error is written to stderr. */
const DID_NOT_LOAD_STATUS = 'Kit did not load; the error is on stderr';

interface HumanRunSettings {
  diagnose: boolean;
  failOn: Severity | undefined;
  quiet: boolean;
  remote: RemoteFetchContext;
  reportOn: Severity | undefined;
  unrunSources: readonly UnrunSource[];
}

/**
 * Runs all kit entries in human-readable mode.
 *
 * Uses the same per-kit boundary as JSON mode, reporting the failure on stderr so that it stays
 * distinguishable from a failed check, which prints into the stdout report and means a different
 * exit code.
 */
export async function runHumanMode(
  kitEntries: ResolvedKitEntry[],
  settings: HumanRunSettings,
  isJit: boolean,
): Promise<number> {
  // Say so when a run selected nothing, which happens under `--sources` when no configured source
  // publishes the requested kit. A blank screen reads as a tool that failed to start rather than as a pass.
  if (kitEntries.length === 0) {
    process.stdout.write(`${formatEmptySelection(settings.unrunSources)}\n`);
    warnOnUnrunSources(settings.unrunSources);
    return EXIT_OK;
  }

  const isMultiKit = kitEntries.length > 1;
  const { tracking } = readManifestTracking(isJit);
  const pragmaLedger = createPragmaLedger();
  const writeBlock = createBlockWriter();
  const rows: SummaryRow[] = [];
  const kitThresholds: KitThreshold[] = [];
  let allPassed = true;
  let anyBlockDropped = false;
  let missingKitCount = 0;
  let withheld: WithheldFailures | undefined;

  for (const entry of kitEntries) {
    const kitSegments = buildKitSegments(entry, isMultiKit);

    try {
      const { kit, compileTimeVersion } = await loadKit(entry, settings.remote);
      recordKitCheckIds(kit, pragmaLedger, entry.provenance);

      warnOnKitStaleness(entry.name, entry.source, tracking);
      warnOnVersionSkew(entry.name, kit, compileTimeVersion, entry.provenance);

      const kitResult = await runKit(kit, entry.checklists, settings, {
        entry,
        isMultiKit,
        kitSegments,
        pragmaLedger,
        writeBlock,
      });
      rows.push(...kitResult.rows);
      kitThresholds.push({ kitName: entry.name, failOn: kitResult.failOn });
      if (kitResult.hasDroppedBlock) anyBlockDropped = true;
      if (!kitResult.passed) allPassed = false;
      if (kitResult.withheldCount > 0) withheld = addWithheld(withheld, kitResult.withheldCount, kitResult.failOn);
    } catch (error: unknown) {
      // Head even a kit that never ran, so that stdout alone lists every kit that the invocation asked for and
      // states which of them did not load.
      if (kitSegments.length > 0) {
        const layout = getLayout();
        const status = `${layout.token('failedError')}${DID_NOT_LOAD_STATUS}`;
        writeBlock(`${layout.formatBreadcrumb(kitSegments, 'kit')}\n${status}`);
        rows.push({ counts: emptyCounts(), didNotLoad: true, durationMs: 0, segments: kitSegments });
      }

      // A lone kit needs no label: nothing to disambiguate, and its source is already in the message.
      const label = kitSegments.length > 0 ? ` [${getLayout().formatBreadcrumbLabel(kitSegments)}]` : '';
      const rdyError = toRdyError(error);
      process.stderr.write(`Error${label}: ${rdyError.message}\n`);
      if (rdyError.hint !== undefined) {
        process.stderr.write(getLayout().formatHint(rdyError.hint) + '\n');
      }
      missingKitCount++;
    }
  }

  // Tally after the last kit rather than inside one, so a kit that failed to load still leaves the table
  // covering the checklists that did run. Because a dropped block is reported by its row alone, one dropped
  // block justifies the table even when the table has only a single row to show.
  if (rows.length > 1 || anyBlockDropped) writeBlock(formatCombinedSummary(rows));

  // Warn after the summary table, the last block in which a reported file may have been named.
  warnOnUnusedPragmas(pragmaLedger);
  await warnOnUnmarkedGeneratedSources(pragmaLedger);
  warnOnUnrunSources(settings.unrunSources);

  // Close with the verdict, after the warnings on stderr, so that it is the last line of a merged CI log.
  writeBlock(formatRunVerdict({ kitThresholds, missingKitCount, passed: allPassed, withheld }));

  return resolveRunExitCode(missingKitCount > 0, allPassed);
}

// region | Helpers

/**
 * Returns `withheld` with a kit's withheld failing checks added, showing them all at the least severe of the
 * kits' failure thresholds.
 */
function addWithheld(withheld: WithheldFailures | undefined, count: number, failOn: Severity): WithheldFailures {
  if (withheld === undefined) return { count, showAt: failOn };

  return {
    count: withheld.count + count,
    showAt: meetsThreshold(failOn, withheld.showAt) ? withheld.showAt : failOn,
  };
}

/**
 * Returns the segments heading every block produced by a kit: where the kit came from, then the kit itself.
 *
 * A kit with no source to name and no sibling kit in the run has nothing to be told apart from, so its
 * blocks have no heading, and a plain local run stays as quiet as it has always been.
 */
function buildKitSegments(entry: ResolvedKitEntry, isMultiKit: boolean): BreadcrumbSegment[] {
  const source = describeKitProvenance(entry.provenance);
  if (source === undefined) return isMultiKit ? [{ role: 'kit', text: entry.name }] : [];

  return [source, { role: 'kit', text: entry.name }];
}

/**
 * Returns how many of a report's failed checks meet `failOn` but are left out of the tree by `reportOn`.
 *
 * Visibility comes from the rule that renders the tree, so a failed check retained as the ancestor of a visible
 * result is not counted.
 */
function countWithheldFailures(report: RdyReport, failOn: Severity, reportOn: Severity): number {
  const visible = new Set(selectVisibleResults(report.results, reportOn));
  return report.results.filter(
    (result) => result.status === 'failed' && meetsThreshold(result.severity, failOn) && !visible.has(result),
  ).length;
}

/** Writes one block of a run to stdout, separated from the block before it by a blank line. */
type BlockWriter = (text: string) => void;

/**
 * Returns a writer that separates each block of a run from the one before with a single blank line.
 *
 * Separation lives here rather than in the headings because only a sequence can see what precedes it, and
 * the run's first block needs no blank at all. One width serves every boundary, a kit's included: The
 * heading below a gap names the kit that it opens, so a wider gap would restate in whitespace what the next
 * line already states in words.
 */
function createBlockWriter(): BlockWriter {
  let hasWritten = false;

  return (text) => {
    if (hasWritten) process.stdout.write('\n');
    hasWritten = true;
    process.stdout.write(`${text}\n`);
  };
}

/**
 * Returns the segment naming where a kit came from, or `undefined` when there is nothing to name.
 *
 * A kit in the local kits directory has no source, and neither does one whose directory resolves to
 * the working directory: Naming the directory in which the reader is standing tells them nothing. A package
 * states its version because the whole point of running a kit from an installed package is that it
 * matches the version in place, which the reader can only confirm if it is stated.
 */
function describeKitProvenance(provenance: KitProvenance | undefined): BreadcrumbSegment | undefined {
  if (provenance === undefined) return undefined;
  if (provenance.kind === 'remote') return { role: 'sourceRemote', text: provenance.label };
  if (provenance.kind === 'repository') return { role: 'sourceRemote', text: formatRepositoryLabel(provenance) };
  if (provenance.kind === 'directory') {
    return path.normalize(provenance.label) === '.' ? undefined : { role: 'sourceDirectory', text: provenance.label };
  }

  const version = provenance.version === undefined ? '' : `@${provenance.version}`;
  return { role: 'sourcePackage', text: `${provenance.packageName}${version}` };
}

/** Resolves the effective fixLocation for a checklist, falling back to the kit-level default. */
function resolveFixLocation(checklist: RdyChecklist | RdyStagedChecklist, kitDefault?: FixLocation): FixLocation {
  return checklist.fixLocation ?? kitDefault ?? 'end';
}

/** What a kit's checklists need from the run to which they belong. */
interface KitBlockContext {
  entry: ResolvedKitEntry;
  isMultiKit: boolean;
  kitSegments: BreadcrumbSegment[];
  pragmaLedger: PragmaLedger;
  writeBlock: BlockWriter;
}

/**
 * A kit's verdict and failure threshold, alongside the rows that its checklists contribute to the run's summary
 * table.
 */
interface KitRunResult {
  failOn: Severity;
  hasDroppedBlock: boolean;
  passed: boolean;
  rows: SummaryRow[];
  /** Failed checks that meet the failure threshold but not the reporting threshold. */
  withheldCount: number;
}

/** Runs the checklists of a single kit in human-readable mode. */
async function runKit(
  kit: RdyKit,
  checklistFilter: string[],
  settings: HumanRunSettings,
  { entry, isMultiKit, kitSegments, pragmaLedger, writeBlock }: KitBlockContext,
): Promise<KitRunResult> {
  const checklists = selectChecklists(kit, checklistFilter);
  const thresholds = resolveThresholds(kit, settings.failOn, settings.reportOn);
  const showChecklistSegment = checklists.length > 1;
  // A block may go unwritten only when the summary table will show the row that it leaves behind. A run of
  // one checklist tabulates nothing, so its block is written however little it has to say.
  const willTabulate = isMultiKit || checklists.length > 1;
  const rows: SummaryRow[] = [];
  let allPassed = true;
  let hasDroppedBlock = false;
  let withheldCount = 0;

  for (const checklist of checklists) {
    const report = await runRdy(checklist, {
      defaultSeverity: thresholds.defaultSeverity,
      diagnose: settings.diagnose,
      failOn: thresholds.failOn,
      pragmaLedger,
      provenance: entry.provenance,
    });
    const fixLocation = resolveFixLocation(checklist, kit.fixLocation);
    const { body, hasVisibleResults } = reportRdy(report, {
      fixLocation,
      quiet: settings.quiet,
      reportOn: thresholds.reportOn,
    });

    const segments: BreadcrumbSegment[] = showChecklistSegment
      ? [...kitSegments, { role: 'checklist', text: checklist.name }]
      : kitSegments;

    if (hasVisibleResults || !willTabulate) {
      const heading = segments.length > 0 ? `${getLayout().formatBreadcrumb(segments, 'kit')}\n` : '';
      writeBlock(heading + body);
    } else {
      hasDroppedBlock = true;
    }

    // Warn after the block, so that the reader has just seen the skipped line that the warning is about.
    warnOnMaskedSkips(entry, checklist.name, report.diagnoses);

    if (!report.passed) {
      allPassed = false;
    }

    withheldCount += countWithheldFailures(report, thresholds.failOn, thresholds.reportOn);

    rows.push(toSummaryRow(segments, report));
  }

  return { failOn: thresholds.failOn, hasDroppedBlock, passed: allPassed, rows, withheldCount };
}

/** Builds a summary row from a report, named by the breadcrumb heading of the block into which the report renders. */
function toSummaryRow(segments: BreadcrumbSegment[], report: RdyReport): SummaryRow {
  return { counts: countResults(report.results), durationMs: report.durationMs, segments };
}

// endregion | Helpers
