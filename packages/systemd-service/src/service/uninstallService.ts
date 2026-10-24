import { rm } from 'node:fs/promises';

import { runSystemctl } from '../systemctl/runSystemctl.ts';
import { disableUnit } from './disableUnit.ts';
import { readServiceState } from './readServiceState.ts';
import { removeTimer } from './removeTimer.ts';
import { buildTimerName, buildUnitName, findUnitPath } from './service-targets.ts';

/** What `uninstallService` found: whether systemd had the service loaded when it was stopped. */
export interface UninstallOutcome {
  wasLoaded: boolean;
}

/**
 * Stops and disables the service and its timer and removes their units, leaving nothing for systemd to start at the
 * next boot. Rejects, keeping the unit that it could not disable, when disabling fails while that unit is active.
 */
export async function uninstallService(name: string): Promise<UninstallOutcome> {
  const unitName = buildUnitName(name);
  const { loaded: wasLoaded } = await readServiceState(name);

  // Remove the timer first, so that it cannot start the service while the service is being removed.
  const hadTimer = await removeTimer(name);
  await disableUnit(unitName);
  await rm(findUnitPath(name), { force: true });

  const reload = await runSystemctl(['daemon-reload']);
  if (reload.exitCode !== 0) {
    throw new Error(`systemctl daemon-reload failed: ${reload.output.trim()}`);
  }
  // A unit that never failed has no failed state to clear, which `reset-failed` reports as an error.
  await runSystemctl(['reset-failed', unitName]);
  if (hadTimer) await runSystemctl(['reset-failed', buildTimerName(name)]);

  return { wasLoaded };
}
