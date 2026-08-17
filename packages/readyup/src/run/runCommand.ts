import type { Severity } from '../kits/types.ts';
import type { JsonDetail } from '../schemas/reportSchema.ts';
import type { ResolvedKitEntry } from './ResolvedKitEntry.ts';
import { runHumanMode } from './runHumanMode.ts';
import { runJsonMode } from './runJsonMode.ts';

interface RunCommandOptions {
  kitEntries: ResolvedKitEntry[];
  json: boolean;
  detail?: JsonDetail;
  diagnose?: boolean;
  failOn?: Severity;
  quiet?: boolean;
  reportOn?: Severity;
}

/** Runs rdy checklists across one or more kits. Returns a numeric exit code. */
export async function runCommand(
  { kitEntries, json, detail, diagnose, failOn, quiet, reportOn }: RunCommandOptions,
  isJit = false,
): Promise<number> {
  if (json) {
    return runJsonMode(kitEntries, { detail: detail ?? 'full', diagnose: diagnose === true, failOn, reportOn }, isJit);
  }
  return runHumanMode(kitEntries, { diagnose: diagnose === true, failOn, quiet: quiet === true, reportOn }, isJit);
}
