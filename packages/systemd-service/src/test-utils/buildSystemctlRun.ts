import type { SystemctlRun } from '../systemctl/runSystemctl.ts';

/** Builds a systemctl result. */
export function buildSystemctlRun(exitCode: number, output = ''): SystemctlRun {
  return { exitCode, output };
}
