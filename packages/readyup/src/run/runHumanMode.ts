import path from 'node:path';
import process from 'node:process';

import { EXIT_OK } from '../bin/exitCodes.ts';
import type { RdyError } from '../errors/RdyError.ts';
import { formatRepositoryLabel, type KitProvenance } from '../kits/KitProvenance.ts';
import type { FixLocation, RdyChecklist, RdyReport, RdyStagedChecklist, Severity } from '../kits/types.ts';
import { getLayout } from '../layout/engine.ts';
import type { BreadcrumbSegment, NotRunReason, SummaryRow } from '../layout/layoutEngine.ts';
import { writeWarnings } from '../output/writeWarnings.ts';
import { formatCombinedSummary } from '../reporting/formatCombinedSummary.ts';
import { formatRunVerdict, type KitThreshold, type WithheldFailures } from '../reporting/formatRunVerdict.ts';
import { countResults, emptyCounts, reportRdy, selectVisibleResults } from '../reporting/reportRdy.ts';
import { meetsThreshold } from '../severity/meetsThreshold.ts';
import type { ResolvedKitEntry } from './ResolvedKitEntry.ts';
import { resolveRunExitCode } from './resolveRunExitCode.ts';
import {
  defaultKitRunDependencies,
  type KitRunDependencies,
  type KitRunEvent,
  type KitRunSettings,
  runKitEntries,
} from './runKitEntries.ts';
import { formatEmptySelection, listUnrunSourceWarnings } from './source-report.ts';

/** The line under the heading of a kit that did not run, for each reason; the error itself is written to stderr. */
const NOT_RUN_STATUSES: Readonly<Record<NotRunReason, string>> = {
  didNotLoad: 'Kit did not load; the error is on stderr',
  failedAfterLoad: 'Kit did not run; the error is on stderr',
};

interface HumanRunSettings extends KitRunSettings {
  quiet: boolean;
}

/** The collaborators of a human-mode run: the run steps' own, and the renderers of its blocks and summary. */
export interface HumanRunDependencies extends KitRunDependencies {
  formatCombinedSummary: typeof formatCombinedSummary;
  reportRdy: typeof reportRdy;
}

const defaultHumanRunDependencies: HumanRunDependencies = {
  ...defaultKitRunDependencies,
  formatCombinedSummary,
  reportRdy,
};

/**
 * Runs all kit entries in human-readable mode.
 *
 * Reports the error of a kit that did not run on stderr, so that it stays distinguishable from a failed check,
 * which prints into the stdout report and means a different exit code.
 */
export async function runHumanMode(
  kitEntries: ResolvedKitEntry[],
  settings: HumanRunSettings,
  isJit: boolean,
  dependencies: HumanRunDependencies = defaultHumanRunDependencies,
): Promise<number> {
  // Say so when a run selected nothing, which happens under `--sources` when no configured source
  // publishes the requested kit. A blank screen reads as a tool that failed to start rather than as a pass.
  if (kitEntries.length === 0) {
    process.stdout.write(`${formatEmptySelection(settings.unrunSources)}\n`);
    writeWarnings(listUnrunSourceWarnings(settings.unrunSources));
    return EXIT_OK;
  }

  const isMultiKit = kitEntries.length > 1;
  const writeBlock = createBlockWriter();
  const rows: SummaryRow[] = [];
  const kitThresholds: KitThreshold[] = [];
  let anyBlockDropped = false;
  let withheld: WithheldFailures | undefined;
  // A kit's contributions to the summary are committed only once it finishes, so that a kit that throws partway
  // through leaves its not-run row alone in the table.
  let currentKit: KitInProgress | undefined;

  for await (const event of runKitEntries(kitEntries, settings, isJit, dependencies)) {
    switch (event.kind) {
      case 'runStarted':
        writeWarnings(event.warnings);
        break;
      case 'kitLoaded':
        writeWarnings(event.warnings);
        currentKit = startKit(event, isMultiKit);
        break;
      case 'checklistReported':
        if (currentKit !== undefined) {
          reportChecklist(event.checklist, event.report, currentKit, settings, writeBlock, dependencies.reportRdy);
        }
        // Warn after the block, so that the reader has just seen the skipped line that the warning is about.
        writeWarnings(event.warnings);
        break;
      case 'kitFinished':
        if (currentKit !== undefined) {
          rows.push(...currentKit.rows);
          kitThresholds.push({ kitName: event.entry.name, failOn: currentKit.thresholds.failOn });
          if (currentKit.hasDroppedBlock) anyBlockDropped = true;
          if (currentKit.withheldCount > 0) {
            withheld = addWithheld(withheld, currentKit.withheldCount, currentKit.thresholds.failOn);
          }
        }
        currentKit = undefined;
        break;
      case 'kitFailed':
        writeWarnings(event.warnings);
        rows.push(...reportUnrunKit(event.error, event.reason, buildKitSegments(event.entry, isMultiKit), writeBlock));
        currentKit = undefined;
        break;
      case 'runFinished': {
        // Tally after the last kit rather than inside one, so a kit that failed to load still leaves the table
        // covering the checklists that did run. Because a dropped block is reported by its row alone, one dropped
        // block justifies the table even when the table has only a single row to show.
        if (rows.length > 1 || anyBlockDropped) writeBlock(dependencies.formatCombinedSummary(rows));

        // Warn after the summary table, the last block in which a reported file may have been named.
        writeWarnings(event.warnings);

        // Close with the verdict, after the warnings on stderr, so that it is the last line of a merged CI log.
        const missingKitCount = event.failedKitCount;
        writeBlock(formatRunVerdict({ kitThresholds, missingKitCount, passed: event.allPassed, withheld }));

        return resolveRunExitCode(missingKitCount > 0, event.allPassed);
      }
    }
  }

  throw new Error('The run ended without a runFinished event');
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

/** What a kit's blocks need from the kit, and what its checklists add to the run's summary once it finishes. */
interface KitInProgress {
  fixLocation: FixLocation | undefined;
  hasDroppedBlock: boolean;
  kitSegments: BreadcrumbSegment[];
  rows: SummaryRow[];
  showChecklistSegment: boolean;
  thresholds: { failOn: Severity; reportOn: Severity };
  willTabulate: boolean;
  /** Failed checks that meet the failure threshold but not the reporting threshold. */
  withheldCount: number;
}

/** Renders one checklist's report as a block, and adds its row and withheld failures to the kit in progress. */
function reportChecklist(
  checklist: RdyChecklist | RdyStagedChecklist,
  report: RdyReport,
  kit: KitInProgress,
  settings: HumanRunSettings,
  writeBlock: BlockWriter,
  renderReport: typeof reportRdy,
): void {
  const { failOn, reportOn } = kit.thresholds;
  const { body, hasVisibleResults } = renderReport(report, {
    fixLocation: resolveFixLocation(checklist, kit.fixLocation),
    quiet: settings.quiet,
    reportOn,
  });

  const segments: BreadcrumbSegment[] = kit.showChecklistSegment
    ? [...kit.kitSegments, { role: 'checklist', text: checklist.name }]
    : kit.kitSegments;

  if (hasVisibleResults || !kit.willTabulate) {
    const heading = segments.length > 0 ? `${getLayout().formatBreadcrumb(segments, 'kit')}\n` : '';
    writeBlock(heading + body);
  } else {
    kit.hasDroppedBlock = true;
  }

  kit.withheldCount += countWithheldFailures(report, failOn, reportOn);
  kit.rows.push(toSummaryRow(segments, report));
}

/**
 * Reports a kit that threw before it finished, and returns its summary rows: one, or none for a lone kit.
 *
 * The kit is headed even though it produced no results, so that stdout alone lists every kit that the invocation
 * asked for and states which of them did not run and why.
 */
function reportUnrunKit(
  rdyError: RdyError,
  reason: NotRunReason,
  kitSegments: BreadcrumbSegment[],
  writeBlock: BlockWriter,
): SummaryRow[] {
  const layout = getLayout();
  const rows: SummaryRow[] = [];
  if (kitSegments.length > 0) {
    writeBlock(
      `${layout.formatBreadcrumb(kitSegments, 'kit')}\n${layout.token('failedError')}${NOT_RUN_STATUSES[reason]}`,
    );
    rows.push({ counts: emptyCounts(), durationMs: 0, notRun: reason, segments: kitSegments });
  }

  // A lone kit needs no label: nothing to disambiguate, and its source is already in the message.
  const label = kitSegments.length > 0 ? ` [${layout.formatBreadcrumbLabel(kitSegments)}]` : '';
  process.stderr.write(`Error${label}: ${rdyError.message}\n`);
  if (rdyError.hint !== undefined) {
    process.stderr.write(layout.formatHint(rdyError.hint) + '\n');
  }

  return rows;
}

/** Resolves the effective fixLocation for a checklist, falling back to the kit-level default. */
function resolveFixLocation(checklist: RdyChecklist | RdyStagedChecklist, kitDefault?: FixLocation): FixLocation {
  return checklist.fixLocation ?? kitDefault ?? 'end';
}

/** Returns the state of a kit whose checklists are about to report, before any of its blocks is written. */
function startKit(event: Extract<KitRunEvent, { kind: 'kitLoaded' }>, isMultiKit: boolean): KitInProgress {
  const { checklists, entry, kit, thresholds } = event;
  return {
    fixLocation: kit.fixLocation,
    hasDroppedBlock: false,
    kitSegments: buildKitSegments(entry, isMultiKit),
    rows: [],
    showChecklistSegment: checklists.length > 1,
    thresholds,
    // A block may go unwritten only when the summary table will show the row that it leaves behind. A run of
    // one checklist tabulates nothing, so its block is written however little it has to say.
    willTabulate: isMultiKit || checklists.length > 1,
    withheldCount: 0,
  };
}

/** Builds a summary row from a report, named by the breadcrumb heading of the block into which the report renders. */
function toSummaryRow(segments: BreadcrumbSegment[], report: RdyReport): SummaryRow {
  return { counts: countResults(report.results), durationMs: report.durationMs, segments };
}

// endregion | Helpers
