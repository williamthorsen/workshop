import { rm } from 'node:fs/promises';

import { runLaunchctl } from '../launchctl/runLaunchctl.ts';
import { buildServiceTarget, findPlistPath } from './agent-targets.ts';

/** What `uninstallAgent` found: whether launchd held the agent when it was booted out. */
export interface UninstallOutcome {
  wasLoaded: boolean;
}

/**
 * Boots the agent out and removes its plist, leaving nothing for launchd to load at the next login. Rejects, keeping
 * the plist, when the bootout fails while launchd still holds the agent.
 */
export async function uninstallAgent(label: string): Promise<UninstallOutcome> {
  const serviceTarget = buildServiceTarget(label);
  const bootout = await runLaunchctl(['bootout', serviceTarget]);
  if (bootout.exitCode !== 0 && (await runLaunchctl(['print', serviceTarget])).exitCode === 0) {
    throw new Error(`launchctl bootout failed while launchd still holds ${label}: ${bootout.output.trim()}`);
  }

  await rm(findPlistPath(label), { force: true });

  return { wasLoaded: bootout.exitCode === 0 };
}
