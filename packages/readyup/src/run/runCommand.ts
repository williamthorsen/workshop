import path from 'node:path';
import process from 'node:process';

import { EXIT_OK } from '../bin/exitCodes.ts';
import { toRdyError } from '../errors/RdyError.ts';
import type { KitProvenance } from '../kits/KitProvenance.ts';
import type { FixLocation, RdyChecklist, RdyKit, RdyReport, RdyStagedChecklist, Severity } from '../kits/types.ts';
import { getLayout } from '../layout/engine.ts';
import type { BreadcrumbSegment, SummaryRow } from '../layout/layoutEngine.ts';
import { formatCombinedSummary } from '../reporting/formatCombinedSummary.ts';
import { formatJsonReport, type KitInput } from '../reporting/formatJsonReport.ts';
import { countResults, reportRdy } from '../reporting/reportRdy.ts';
import type { JsonWarning } from '../schemas/common.ts';
import type { JsonDetail, JsonKitOrigin } from '../schemas/reportSchema.ts';
import { readManifestTracking, warnOnKitStaleness } from './kit-staleness.ts';
import { loadKit } from './loadKit.ts';
import type { ResolvedKitEntry } from './ResolvedKitEntry.ts';
import { resolveRunExitCode } from './resolveRunExitCode.ts';
import { resolveThresholds } from './resolveThresholds.ts';
import { runRdy } from './runRdy.ts';
import { selectChecklists } from './selectChecklists.ts';

/** Resolve the effective fixLocation for a checklist, falling back to the kit-level default. */
function resolveFixLocation(checklist: RdyChecklist | RdyStagedChecklist, kitDefault?: FixLocation): FixLocation {
  return checklist.fixLocation ?? kitDefault ?? 'end';
}

/** Builds a summary row from a report, named by the breadcrumb heading the block the report renders into. */
function toSummaryRow(segments: BreadcrumbSegment[], report: RdyReport): SummaryRow {
  return { counts: countResults(report.results), durationMs: report.durationMs, segments };
}

interface RunCommandOptions {
  kitEntries: ResolvedKitEntry[];
  json: boolean;
  detail?: JsonDetail;
  failOn?: Severity;
  quiet?: boolean;
  reportOn?: Severity;
}

interface HumanRunSettings {
  failOn: Severity | undefined;
  quiet: boolean;
  reportOn: Severity | undefined;
}

/** Run rdy checklists across one or more kits. Returns a numeric exit code. */
export async function runCommand(
  { kitEntries, json, detail, failOn, quiet, reportOn }: RunCommandOptions,
  isJit = false,
): Promise<number> {
  if (json) {
    return runMultiKitJsonMode(kitEntries, { detail: detail ?? 'full', failOn, reportOn }, isJit);
  }
  return runMultiKitHumanMode(kitEntries, { failOn, quiet: quiet === true, reportOn }, isJit);
}

/**
 * Runs all kit entries in JSON mode, producing a single JSON report.
 *
 * Each iteration is its own error boundary: once the run has dispatched, anything the loop body
 * throws is attributable to that kit alone, so it becomes an entry in the report rather than
 * discarding the kits that already ran. The scope is positional rather than keyed on `RdyErrorCode`
 * — a consumer cannot predict which codes would escape, and a new code would silently pick a branch.
 */
async function runMultiKitJsonMode(
  kitEntries: ResolvedKitEntry[],
  runSettings: { detail: JsonDetail; failOn: Severity | undefined; reportOn: Severity | undefined },
  isJit: boolean,
): Promise<number> {
  const { detail, failOn, reportOn } = runSettings;
  const kitInputs: KitInput[] = [];
  const warnings: JsonWarning[] = [];
  const tracking = readManifestTracking(isJit);
  let allPassed = true;
  let anyKitFailed = false;

  for (const entry of kitEntries) {
    try {
      const { kit, compileTimeVersion } = await loadKit(entry, isJit);

      warnings.push(...warnOnKitStaleness(entry.name, entry.source, tracking));

      const thresholds = resolveThresholds(kit, failOn, reportOn);
      const checklists = selectChecklists(kit, entry.checklists);

      const entries: Array<{ name: string; report: RdyReport }> = [];

      for (const checklist of checklists) {
        const report = await runRdy(checklist, {
          defaultSeverity: thresholds.defaultSeverity,
          failOn: thresholds.failOn,
        });
        entries.push({ name: checklist.name, report });
        if (!report.passed) allPassed = false;
      }

      kitInputs.push({
        name: entry.name,
        ...toJsonOriginField(entry.provenance),
        ...(compileTimeVersion !== undefined && { compiledWith: compileTimeVersion }),
        entries,
        failOn: thresholds.failOn,
        reportOn: thresholds.reportOn,
      });
    } catch (error: unknown) {
      // An entry built here carries no `compiledWith`: a kit that produced no results has nothing
      // for a compile-time version to explain.
      const { code, hint, message } = toRdyError(error);
      kitInputs.push({
        name: entry.name,
        ...toJsonOriginField(entry.provenance),
        error: { code, message, ...(hint !== undefined && { hint }) },
      });
      anyKitFailed = true;
    }
  }

  // The top-level thresholds say what the invocation asked for, so an absent flag stays absent
  // rather than being reported as a default nobody requested. What governed each kit, including a
  // threshold the kit declared for itself, travels on that kit's entry.
  const output = formatJsonReport(kitInputs, {
    detail,
    ...(failOn !== undefined && { failOn }),
    ...(reportOn !== undefined && { reportOn }),
    ...(warnings.length > 0 && { warnings }),
  });
  process.stdout.write(output + '\n');

  return resolveRunExitCode(anyKitFailed, allPassed);
}

/**
 * Runs all kit entries in human-readable mode.
 *
 * Carries the same per-kit boundary as JSON mode, reporting the failure on stderr so it stays
 * distinguishable from a failed check, which prints into the stdout report and means a different
 * exit code.
 */
async function runMultiKitHumanMode(
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

      const kitResult = await runSingleKitHumanMode(kit, entry.checklists, settings, {
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
async function runSingleKitHumanMode(
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

/**
 * Returns the `origin` field for a kit's JSON entry, empty for a kit no package published.
 *
 * The wire shape names the publishing package and nothing else, so every other provenance contributes no
 * field at all -- which is the shape a consumer has always seen for a kit resolved from anywhere but a
 * package. A version the package did not declare readably is omitted.
 */
function toJsonOriginField(provenance: KitProvenance | undefined): { origin?: JsonKitOrigin } {
  if (provenance?.kind !== 'package') return {};

  return {
    origin:
      provenance.version === undefined
        ? { package: provenance.packageName }
        : { package: provenance.packageName, version: provenance.version },
  };
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
