import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';

import type { Severity } from '../../kits/types.ts';
import { createUncachedRemoteContext } from '../../test-utils/createUncachedRemoteContext.ts';
import type { UnrunSource } from '../KitSelection.ts';
import type { ResolvedKitEntry } from '../ResolvedKitEntry.ts';
import { runHumanMode } from '../runHumanMode.ts';

/** The settings named by a test, over the defaults that the dispatch would have resolved. */
export interface HumanRunOptions {
  diagnose?: boolean;
  failOn?: Severity;
  isJit?: boolean;
  quiet?: boolean;
  reportOn?: Severity;
  unrunSources?: UnrunSource[];
}

/**
 * Runs the mode over the given entries, filling in every setting that the test did not name, and returns its
 * exit code alongside everything it wrote.
 */
export async function runHuman(
  kitEntries: ResolvedKitEntry[],
  { diagnose = false, failOn, isJit = false, quiet = false, reportOn, unrunSources = [] }: HumanRunOptions = {},
) {
  using io = captureStdio();

  const remote = createUncachedRemoteContext();
  const exitCode = await runHumanMode(kitEntries, { diagnose, failOn, quiet, remote, reportOn, unrunSources }, isJit);

  return { exitCode, stdout: io.stdout, stderr: io.stderr };
}
