import type { Severity } from '../kits/types.ts';
import type { RemoteFetchContext } from '../remote/createRemoteFetchContext.ts';
import type { JsonDetail } from '../schemas/reportSchema.ts';
import type { UnrunSource } from './KitSelection.ts';
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
  remote: RemoteFetchContext;
  reportOn?: Severity;
  /** The configured sources from which a `--sources` run selected no kit. */
  unrunSources?: UnrunSource[];
}

/** The run modes between which the command dispatches. */
export interface RunCommandDependencies {
  runHumanMode: typeof runHumanMode;
  runJsonMode: typeof runJsonMode;
}

const defaultRunCommandDependencies: RunCommandDependencies = { runHumanMode, runJsonMode };

/** Runs rdy checklists across one or more kits, returning the exit code that they produced. */
export async function runCommand(
  { kitEntries, json, detail, diagnose, failOn, quiet, remote, reportOn, unrunSources = [] }: RunCommandOptions,
  isJit = false,
  dependencies: RunCommandDependencies = defaultRunCommandDependencies,
): Promise<number> {
  if (json) {
    return dependencies.runJsonMode(
      kitEntries,
      { detail: detail ?? 'full', diagnose: diagnose === true, failOn, remote, reportOn, unrunSources },
      isJit,
    );
  }
  return dependencies.runHumanMode(
    kitEntries,
    { diagnose: diagnose === true, failOn, quiet: quiet === true, remote, reportOn, unrunSources },
    isJit,
  );
}
