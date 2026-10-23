import { rm } from 'node:fs/promises';

import { runSystemctl } from '../systemctl/runSystemctl.ts';
import { readServiceState } from './readServiceState.ts';
import { buildUnitName, findUnitPath } from './service-targets.ts';

/** What `uninstallService` found: whether systemd had the service loaded when it was stopped. */
export interface UninstallOutcome {
  wasLoaded: boolean;
}

/**
 * Stops and disables the service and removes its unit, leaving nothing for systemd to start at the next boot. Rejects,
 * keeping the unit, when disabling fails while the service is still active.
 */
export async function uninstallService(name: string): Promise<UninstallOutcome> {
  const unitName = buildUnitName(name);
  const { loaded: wasLoaded } = await readServiceState(name);

  const disable = await runSystemctl(['disable', '--now', unitName]);
  if (disable.exitCode !== 0 && (await runSystemctl(['is-active', '--quiet', unitName])).exitCode === 0) {
    throw new Error(`systemctl disable failed while ${unitName} is still active: ${disable.output.trim()}`);
  }

  await rm(findUnitPath(name), { force: true });

  const reload = await runSystemctl(['daemon-reload']);
  if (reload.exitCode !== 0) {
    throw new Error(`systemctl daemon-reload failed: ${reload.output.trim()}`);
  }
  // A unit that never failed has no failed state to clear, which `reset-failed` reports as an error.
  await runSystemctl(['reset-failed', unitName]);

  return { wasLoaded };
}
