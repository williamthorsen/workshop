import process from 'node:process';

import { toRdyError } from '../errors/RdyError.ts';
import type { KitProvenance } from '../kits/KitProvenance.ts';
import type { RdyReport, Severity } from '../kits/types.ts';
import { writeWarnings } from '../output/writeWarnings.ts';
import type { RemoteFetchContext } from '../remote/createRemoteFetchContext.ts';
import { formatJsonReport, type KitInput } from '../reporting/formatJsonReport.ts';
import type { JsonWarning } from '../schemas/common.ts';
import type { JsonDetail, JsonKitOrigin } from '../schemas/reportSchema.ts';
import { listUnmarkedGeneratedSourceWarnings } from './generated-report.ts';
import { listKitStalenessWarnings, readManifestTracking } from './kit-staleness.ts';
import type { UnrunSource } from './KitSelection.ts';
import { loadKit } from './loadKit.ts';
import { listUnusedPragmaWarnings } from './pragma-report.ts';
import { createPragmaLedger } from './PragmaLedger.ts';
import { recordKitCheckIds } from './recordKitCheckIds.ts';
import type { ResolvedKitEntry } from './ResolvedKitEntry.ts';
import { resolveRunExitCode } from './resolveRunExitCode.ts';
import { resolveThresholds } from './resolveThresholds.ts';
import { runRdy } from './runRdy.ts';
import { selectChecklists } from './selectChecklists.ts';
import { listMaskedSkipWarnings } from './skip-diagnosis.ts';
import { listUnrunSourceWarnings } from './source-report.ts';
import { listVersionSkewWarnings } from './version-skew.ts';

interface JsonRunSettings {
  detail: JsonDetail;
  diagnose: boolean;
  failOn: Severity | undefined;
  remote: RemoteFetchContext;
  reportOn: Severity | undefined;
  unrunSources: readonly UnrunSource[];
}

/**
 * Runs all kit entries in JSON mode, producing a single JSON report.
 *
 * Each iteration is its own error boundary: Once the run has dispatched, anything the loop body
 * throws is attributable to that kit alone, so the run records it as an entry in the report rather
 * than discarding the kits that already ran. The scope is positional rather than keyed on `RdyErrorCode`
 * -- a consumer cannot predict which codes would escape, and a new code would silently pick a branch.
 */
export async function runJsonMode(
  kitEntries: ResolvedKitEntry[],
  settings: JsonRunSettings,
  isJit: boolean,
): Promise<number> {
  const { detail, diagnose, failOn, remote, reportOn, unrunSources } = settings;
  const kitInputs: KitInput[] = [];
  const warnings: JsonWarning[] = [];
  /** Adds a batch of warnings to the report and writes them to stderr, so that the two outputs always agree. */
  function recordWarnings(batch: readonly JsonWarning[]): void {
    warnings.push(...batch);
    writeWarnings(batch);
  }

  const { tracking, warnings: manifestWarnings } = readManifestTracking(isJit);
  recordWarnings(manifestWarnings);
  const pragmaLedger = createPragmaLedger();
  let allPassed = true;
  let anyKitFailed = false;

  for (const entry of kitEntries) {
    try {
      const { kit, compileTimeVersion } = await loadKit(entry, remote);
      recordKitCheckIds(kit, pragmaLedger, entry.provenance);

      recordWarnings([
        ...listKitStalenessWarnings(entry.name, entry.source, tracking),
        ...listVersionSkewWarnings(entry.name, kit, compileTimeVersion, entry.provenance),
      ]);

      const thresholds = resolveThresholds(kit, failOn, reportOn);
      const checklists = selectChecklists(kit, entry.checklists);

      const entries: Array<{ name: string; report: RdyReport }> = [];

      for (const checklist of checklists) {
        const report = await runRdy(checklist, {
          defaultSeverity: thresholds.defaultSeverity,
          diagnose,
          failOn: thresholds.failOn,
          pragmaLedger,
          provenance: entry.provenance,
        });
        entries.push({ name: checklist.name, report });
        recordWarnings(listMaskedSkipWarnings(entry, checklist.name, report.diagnoses));
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
      // An entry built here has no `compiledWith`: A kit that produced no results has nothing
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

  recordWarnings([
    ...listUnusedPragmaWarnings(pragmaLedger),
    ...(await listUnmarkedGeneratedSourceWarnings(pragmaLedger)),
    ...listUnrunSourceWarnings(unrunSources),
  ]);

  // The top-level thresholds say what the invocation asked for: An absent flag stays absent
  // rather than being reported as a default that nobody requested. What governed each kit, including
  // a threshold declared by the kit for itself, appears on that kit's entry.
  const output = formatJsonReport(kitInputs, {
    detail,
    ...(failOn !== undefined && { failOn }),
    ...(reportOn !== undefined && { reportOn }),
    ...(warnings.length > 0 && { warnings }),
  });
  process.stdout.write(output + '\n');

  return resolveRunExitCode(anyKitFailed, allPassed);
}

// region | Helpers

/**
 * Returns the `origin` field for a kit's JSON entry, empty for a kit published by no package or repository.
 *
 * The wire shape names the kit source as the reader wrote it, so every other provenance contributes no field at
 * all. A version, which only an installed package has, is omitted when the package did not declare one readably.
 */
function toJsonOriginField(provenance: KitProvenance | undefined): { origin?: JsonKitOrigin } {
  if (provenance?.kind === 'repository') return { origin: { source: provenance.source } };
  if (provenance?.kind !== 'package') return {};

  return {
    origin:
      provenance.version === undefined
        ? { source: provenance.source }
        : { source: provenance.source, version: provenance.version },
  };
}

// endregion | Helpers
