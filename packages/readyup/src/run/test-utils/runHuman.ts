import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';

import type { Severity } from '../../kits/types.ts';
import { createUncachedRemoteContext } from '../../test-utils/createUncachedRemoteContext.ts';
import type { UnrunSource } from '../KitSelection.ts';
import type { ResolvedKitEntry } from '../ResolvedKitEntry.ts';
import { runHumanMode } from '../runHumanMode.ts';
import { createRunFakes, type RunFakes } from './createRunFakes.ts';

/** The settings named by a test, over the defaults that the dispatch would have resolved. */
export interface HumanRunOptions {
  failOn?: Severity;
  isJit?: boolean;
  quiet?: boolean;
  reportOn?: Severity;
  shouldDiagnose?: boolean;
  unrunSources?: UnrunSource[];
}

/** The exit code of a run and everything that it wrote. */
export interface HumanRunResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/**
 * Runs the mode over the given entries, filling in every setting that the test did not name and every collaborator
 * that it did not fake, and returns its exit code alongside everything it wrote.
 */
export async function runHuman(
  kitEntries: ResolvedKitEntry[],
  { failOn, isJit = false, quiet = false, reportOn, shouldDiagnose = false, unrunSources = [] }: HumanRunOptions = {},
  fakes: Partial<RunFakes> = {},
): Promise<HumanRunResult> {
  using io = captureStdio();

  const remote = createUncachedRemoteContext();
  const exitCode = await runHumanMode(
    kitEntries,
    { failOn, quiet, remote, reportOn, shouldDiagnose, unrunSources },
    isJit,
    {
      ...createRunFakes(),
      ...fakes,
    },
  );

  return { exitCode, stdout: io.stdout, stderr: io.stderr };
}
