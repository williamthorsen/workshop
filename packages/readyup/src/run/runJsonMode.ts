import process from 'node:process';

import type { KitProvenance } from '../kits/KitProvenance.ts';
import type { RdyReport } from '../kits/types.ts';
import { writeWarnings } from '../output/writeWarnings.ts';
import { formatJsonReport, type KitInput, type KitResultInput } from '../reporting/formatJsonReport.ts';
import type { JsonWarning } from '../schemas/common.ts';
import type { JsonDetail, JsonKitOrigin } from '../schemas/reportSchema.ts';
import type { ResolvedKitEntry } from './ResolvedKitEntry.ts';
import { resolveRunExitCode } from './resolveRunExitCode.ts';
import { type KitRunSettings, runKitEntries } from './runKitEntries.ts';

interface JsonRunSettings extends KitRunSettings {
  detail: JsonDetail;
}

/**
 * Runs all kit entries in JSON mode, producing a single JSON report.
 *
 * A kit that did not run becomes an error entry in the report rather than discarding the kits that already ran.
 */
export async function runJsonMode(
  kitEntries: ResolvedKitEntry[],
  settings: JsonRunSettings,
  isJit: boolean,
): Promise<number> {
  const { detail, failOn, reportOn } = settings;
  const kitInputs: KitInput[] = [];
  const warnings: JsonWarning[] = [];
  let kitReports: Array<{ name: string; report: RdyReport }> = [];
  let currentKit: Omit<KitResultInput, 'entries'> | undefined;

  for await (const event of runKitEntries(kitEntries, settings, isJit)) {
    // Add each batch of warnings to the report and write it to stderr, so that the two outputs always agree.
    if ('warnings' in event) {
      warnings.push(...event.warnings);
      writeWarnings(event.warnings);
    }

    switch (event.kind) {
      case 'kitLoaded': {
        const { compileTimeVersion, entry, thresholds } = event;
        kitReports = [];
        currentKit = {
          name: entry.name,
          ...toJsonOriginField(entry.provenance),
          ...(compileTimeVersion !== undefined && { compiledWith: compileTimeVersion }),
          failOn: thresholds.failOn,
          reportOn: thresholds.reportOn,
        };
        break;
      }
      case 'checklistReported':
        kitReports.push({ name: event.checklist.name, report: event.report });
        break;
      case 'kitFinished':
        if (currentKit !== undefined) kitInputs.push({ ...currentKit, entries: kitReports });
        currentKit = undefined;
        break;
      case 'kitFailed': {
        // An entry built here has no `compiledWith`: A kit that produced no results has nothing for a
        // compile-time version to explain.
        const { code, hint, message } = event.error;
        kitInputs.push({
          name: event.entry.name,
          ...toJsonOriginField(event.entry.provenance),
          error: { code, message, ...(hint !== undefined && { hint }) },
        });
        currentKit = undefined;
        break;
      }
      case 'runFinished': {
        // The top-level thresholds say what the invocation asked for: An absent flag stays absent rather than
        // being reported as a default that nobody requested. What governed each kit, including a threshold
        // declared by the kit for itself, appears on that kit's entry.
        const output = formatJsonReport(kitInputs, {
          detail,
          ...(failOn !== undefined && { failOn }),
          ...(reportOn !== undefined && { reportOn }),
          ...(warnings.length > 0 && { warnings }),
        });
        process.stdout.write(output + '\n');
        return resolveRunExitCode(event.failedKitCount > 0, event.allPassed);
      }
      case 'runStarted':
        break;
    }
  }

  throw new Error('The run ended without a runFinished event');
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
