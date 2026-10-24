import { runSystemctl } from '../systemctl/runSystemctl.ts';

/**
 * Stops and disables a unit. A failure is ignored once the unit is inactive, as it is for a unit that systemd does not
 * know, and rejects while the unit is still active.
 */
export async function disableUnit(unitName: string): Promise<void> {
  const disable = await runSystemctl(['disable', '--now', unitName]);
  if (disable.exitCode !== 0 && (await runSystemctl(['is-active', '--quiet', unitName])).exitCode === 0) {
    throw new Error(`systemctl disable failed while ${unitName} is still active: ${disable.output.trim()}`);
  }
}
