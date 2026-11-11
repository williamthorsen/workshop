import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';

import type { Severity } from '../../kits/types.ts';
import type { JsonDetail } from '../../schemas/reportSchema.ts';
import { createUncachedRemoteContext } from '../../test-utils/createUncachedRemoteContext.ts';
import type { UnrunSource } from '../KitSelection.ts';
import type { ResolvedKitEntry } from '../ResolvedKitEntry.ts';
import { runJsonMode } from '../runJsonMode.ts';
import { createRunFakes, type RunFakes } from './createRunFakes.ts';

/** The settings named by a test, over the defaults that the dispatch would have resolved. */
export interface JsonRunOptions {
  detail?: JsonDetail;
  failOn?: Severity;
  reportOn?: Severity;
  shouldDiagnose?: boolean;
  unrunSources?: UnrunSource[];
}

/** The exit code of a run and everything that it wrote. */
export interface JsonRunResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/**
 * Runs the mode over the given entries, filling in every setting that the test did not name and every collaborator
 * that it did not fake, and returns its exit code alongside everything it wrote.
 */
export async function runJson(
  kitEntries: ResolvedKitEntry[],
  { detail = 'full', failOn, reportOn, shouldDiagnose = false, unrunSources = [] }: JsonRunOptions = {},
  fakes: Partial<RunFakes> = {},
): Promise<JsonRunResult> {
  using io = captureStdio();

  const remote = createUncachedRemoteContext();
  const exitCode = await runJsonMode(
    kitEntries,
    { detail, failOn, remote, reportOn, shouldDiagnose, unrunSources },
    false,
    {
      ...createRunFakes(),
      ...fakes,
    },
  );

  return { exitCode, stdout: io.stdout, stderr: io.stderr };
}
