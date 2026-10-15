import { setTimeout } from 'node:timers/promises';

import { runLaunchctl } from '../launchctl/runLaunchctl.ts';
import { buildDomainTarget, buildServiceTarget } from './agent-targets.ts';

/** How often, and for how long, a replacement waits for launchd to finish dropping the previous instance. */
const BOOTOUT_POLL_MS = 100;
const BOOTOUT_TIMEOUT_MS = 10_000;

/**
 * Boots out whatever launchd holds under the label, waits until launchd has dropped it, then bootstraps the plist.
 *
 * `bootout` can return while launchd is still tearing the service down, and a `bootstrap` issued in that window
 * fails with only launchctl's generic advice to retry as root.
 */
export async function replaceLoadedAgent(label: string, plistPath: string): Promise<void> {
  const serviceTarget = buildServiceTarget(label);

  // A bootout that fails found nothing loaded, which is the state that the wait below looks for anyway.
  await runLaunchctl(['bootout', serviceTarget]);
  for (let waitedMs = 0; (await runLaunchctl(['print', serviceTarget])).exitCode === 0; waitedMs += BOOTOUT_POLL_MS) {
    if (waitedMs >= BOOTOUT_TIMEOUT_MS) {
      throw new Error(`launchd still held ${label} ${BOOTOUT_TIMEOUT_MS / 1_000}s after bootout.`);
    }
    await setTimeout(BOOTOUT_POLL_MS);
  }

  const bootstrap = await runLaunchctl(['bootstrap', buildDomainTarget(), plistPath]);
  if (bootstrap.exitCode !== 0) {
    throw new Error(`launchctl bootstrap failed: ${bootstrap.output.trim()}`);
  }
}
