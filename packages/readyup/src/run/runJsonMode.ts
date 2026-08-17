import process from 'node:process';

import { toRdyError } from '../errors/RdyError.ts';
import type { KitProvenance } from '../kits/KitProvenance.ts';
import type { RdyReport, Severity } from '../kits/types.ts';
import { formatJsonReport, type KitInput } from '../reporting/formatJsonReport.ts';
import type { JsonWarning } from '../schemas/common.ts';
import type { JsonDetail, JsonKitOrigin } from '../schemas/reportSchema.ts';
import { readManifestTracking, warnOnKitStaleness } from './kit-staleness.ts';
import { loadKit } from './loadKit.ts';
import type { ResolvedKitEntry } from './ResolvedKitEntry.ts';
import { resolveRunExitCode } from './resolveRunExitCode.ts';
import { resolveThresholds } from './resolveThresholds.ts';
import { runRdy } from './runRdy.ts';
import { selectChecklists } from './selectChecklists.ts';
import { warnOnMaskedSkips } from './skip-diagnosis.ts';

interface JsonRunSettings {
  detail: JsonDetail;
  diagnose: boolean;
  failOn: Severity | undefined;
  reportOn: Severity | undefined;
}

/**
 * Runs all kit entries in JSON mode, producing a single JSON report.
 *
 * Each iteration is its own error boundary: once the run has dispatched, anything the loop body
 * throws is attributable to that kit alone, so it becomes an entry in the report rather than
 * discarding the kits that already ran. The scope is positional rather than keyed on `RdyErrorCode`
 * — a consumer cannot predict which codes would escape, and a new code would silently pick a branch.
 */
export async function runJsonMode(
  kitEntries: ResolvedKitEntry[],
  settings: JsonRunSettings,
  isJit: boolean,
): Promise<number> {
  const { detail, diagnose, failOn, reportOn } = settings;
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
          diagnose,
          failOn: thresholds.failOn,
        });
        entries.push({ name: checklist.name, report });
        warnings.push(...warnOnMaskedSkips(entry.name, checklist.name, report.diagnoses));
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

// region | Helpers

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

// endregion | Helpers
