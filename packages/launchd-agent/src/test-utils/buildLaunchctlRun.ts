import type { LaunchctlRun } from '../launchctl/runLaunchctl.ts';

/** Builds a launchctl result. */
export function buildLaunchctlRun(exitCode: number, output = ''): LaunchctlRun {
  return { exitCode, output };
}
