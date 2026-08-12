import path from 'node:path';
import process from 'node:process';

import { EXIT_OK } from '../bin/exitCodes.ts';
import { toRdyError } from '../errors/RdyError.ts';
import type { KitProvenance } from '../kits/KitProvenance.ts';
import type { FixLocation, RdyChecklist, RdyKit, RdyReport, RdyStagedChecklist, Severity } from '../kits/types.ts';
import { getLayout } from '../layout/engine.ts';
import type { BreadcrumbSegment, SummaryRow } from '../layout/layoutEngine.ts';
import { formatCombinedSummary } from '../reporting/formatCombinedSummary.ts';
import { countResults, reportRdy } from '../reporting/reportRdy.ts';
import { readManifestTracking, warnOnKitStaleness } from './kit-staleness.ts';
import { loadKit } from './loadKit.ts';
import type { ResolvedKitEntry } from './ResolvedKitEntry.ts';
import { resolveRunExitCode } from './resolveRunExitCode.ts';
import { resolveThresholds } from './resolveThresholds.ts';
import { runRdy } from './runRdy.ts';
import { selectChecklists } from './selectChecklists.ts';

interface HumanRunSettings {
  failOn: Severity | undefined;
  quiet: boolean;
  reportOn: Severity | undefined;
}

/**
 * Runs all kit entries in human-readable mode.
 *
 * Carries the same per-kit boundary as JSON mode, reporting the failure on stderr so it stays
 * distinguishable from a failed check, which prints into the stdout report and means a different
 * exit code.
 */
export async function runHumanMode(
  kitEntries: ResolvedKitEntry[],
  settings: HumanRunSettings,
  isJit: boolean,
): Promise<number> {
  // Say so when a run selected nothing, which `--packages` reaches when no configured package publishes
  // the requested kit. A blank screen reads as a tool that failed to start rather than as a pass.
  if (kitEntries.length === 0) {
    process.stdout.write('No kits to run.\n');
    return EXIT_OK;
  }

  const isMultiKit = kitEntries.length > 1;
  const tracking = readManifestTracking(isJit);
  const writeBlock = createBlockWriter();
  const rows: SummaryRow[] = [];
  let allPassed = true;
  let anyBlockDropped = false;
  let anyKitFailed = false;

  for (const entry of kitEntries) {
    const kitSegments = buildKitSegments(entry, isMultiKit);

    try {
      const { kit } = await loadKit(entry, isJit);

      warnOnKitStaleness(entry.name, entry.source, tracking);

      const kitResult = await runKit(kit, entry.checklists, settings, {
        isMultiKit,
        kitSegments,
        writeBlock,
      });
      rows.push(...kitResult.rows);
      if (kitResult.hasDroppedBlock) anyBlockDropped = true;
      if (!kitResult.passed) allPassed = false;
    } catch (error: unknown) {
      // A kit that never ran is still headed, so stdout lists every kit the invocation asked for.
      if (kitSegments.length > 0) writeBlock(getLayout().formatBreadcrumb(kitSegments, 'kit'));

      // A lone kit needs no label: nothing to disambiguate, and its source is already in the message.
      const label = kitSegments.length > 0 ? ` [${getLayout().formatBreadcrumbLabel(kitSegments)}]` : '';
      const rdyError = toRdyError(error);
      process.stderr.write(`Error${label}: ${rdyError.message}\n`);
      if (rdyError.hint !== undefined) {
        process.stderr.write(getLayout().formatHint(rdyError.hint) + '\n');
      }
      anyKitFailed = true;
    }
  }

  // Tallying follows the last kit rather than riding inside one, so a kit that failed to load still leaves
  // the table covering the checklists that did run. A dropped block is reported by its row alone, so one
  // dropped block earns the table even where a single row is all it has to carry.
  if (rows.length > 1 || anyBlockDropped) writeBlock(formatCombinedSummary(rows));

  return resolveRunExitCode(anyKitFailed, allPassed);
}

// region | Helpers

/**
 * Returns the segments heading every block a kit produces: where the kit came from, then the kit itself.
 *
 * A kit with no source to name and no sibling kit in the run has nothing to be told apart from, so it
 * heads its blocks with nothing, and a plain local run stays as quiet as it has always been.
 */
function buildKitSegments(entry: ResolvedKitEntry, isMultiKit: boolean): BreadcrumbSegment[] {
  const source = describeKitProvenance(entry.provenance);
  if (source === undefined) return isMultiKit ? [{ role: 'kit', text: entry.name }] : [];

  return [source, { role: 'kit', text: entry.name }];
}

/** Writes one block of a run to stdout, parted from the block before it by a blank line. */
type BlockWriter = (text: string) => void;

/**
 * Returns a writer that parts each block of a run from the one before with a single blank line.
 *
 * Separation lives here rather than in the headings because only a sequence can see what precedes it, and
 * the run's first block needs no blank at all. One width serves every boundary, a kit's included: the
 * heading below a gap names the kit it opens, so a wider gap would restate in whitespace what the next
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
 * Returns the segment naming where a kit came from, or nothing where there is nothing to name.
 *
 * A kit the local kits directory holds has no source, and neither does one whose directory resolves to
 * the working directory: naming the directory the reader is standing in tells them nothing. A package
 * carries its version because the whole point of running a kit from an installed package is that it
 * matches the version in place, which the reader can only confirm if it is stated.
 */
function describeKitProvenance(provenance: KitProvenance | undefined): BreadcrumbSegment | undefined {
  if (provenance === undefined) return undefined;
  if (provenance.kind === 'remote') return { role: 'sourceRemote', text: provenance.label };
  if (provenance.kind === 'directory') {
    return path.normalize(provenance.label) === '.' ? undefined : { role: 'sourceDirectory', text: provenance.label };
  }

  const version = provenance.version === undefined ? '' : `@${provenance.version}`;
  return { role: 'sourcePackage', text: `${provenance.packageName}${version}` };
}

/** Resolve the effective fixLocation for a checklist, falling back to the kit-level default. */
function resolveFixLocation(checklist: RdyChecklist | RdyStagedChecklist, kitDefault?: FixLocation): FixLocation {
  return checklist.fixLocation ?? kitDefault ?? 'end';
}

/** What a kit's checklists need in order to take their place in the run's sequence of blocks. */
interface KitBlockContext {
  isMultiKit: boolean;
  kitSegments: BreadcrumbSegment[];
  writeBlock: BlockWriter;
}

/** A kit's verdict alongside the rows its checklists contribute to the run's summary table. */
interface KitRunResult {
  hasDroppedBlock: boolean;
  passed: boolean;
  rows: SummaryRow[];
}

/** Run checklists from a single kit in human-readable mode. */
async function runKit(
  kit: RdyKit,
  checklistFilter: string[],
  settings: HumanRunSettings,
  { isMultiKit, kitSegments, writeBlock }: KitBlockContext,
): Promise<KitRunResult> {
  const checklists = selectChecklists(kit, checklistFilter);
  const thresholds = resolveThresholds(kit, settings.failOn, settings.reportOn);
  const showChecklistSegment = checklists.length > 1;
  // A block may go unwritten only where the summary table will carry the row it leaves behind. A run of
  // one checklist tabulates nothing, so its block stands however little it has to say.
  const willTabulate = isMultiKit || checklists.length > 1;
  const rows: SummaryRow[] = [];
  let allPassed = true;
  let hasDroppedBlock = false;

  for (const checklist of checklists) {
    const report = await runRdy(checklist, {
      defaultSeverity: thresholds.defaultSeverity,
      failOn: thresholds.failOn,
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

    if (!report.passed) {
      allPassed = false;
    }

    rows.push(toSummaryRow(segments, report));
  }

  return { hasDroppedBlock, passed: allPassed, rows };
}

/** Builds a summary row from a report, named by the breadcrumb heading the block the report renders into. */
function toSummaryRow(segments: BreadcrumbSegment[], report: RdyReport): SummaryRow {
  return { counts: countResults(report.results), durationMs: report.durationMs, segments };
}

// endregion | Helpers
