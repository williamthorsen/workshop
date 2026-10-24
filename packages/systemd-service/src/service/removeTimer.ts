import { rm } from 'node:fs/promises';

import { disableUnit } from './disableUnit.ts';
import { isFile } from './isFile.ts';
import { buildTimerName, findTimerPath } from './service-targets.ts';

/**
 * Stops, disables, and removes the service's timer, resolving with whether one was installed. Rejects, keeping the
 * timer, when disabling fails while the timer is still active.
 */
export async function removeTimer(name: string): Promise<boolean> {
  const timerPath = findTimerPath(name);
  if (!(await isFile(timerPath))) return false;

  await disableUnit(buildTimerName(name));
  await rm(timerPath, { force: true });
  return true;
}
