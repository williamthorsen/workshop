import { rm } from 'node:fs/promises';

import { runLaunchctl } from '../launchctl/runLaunchctl.ts';
import { buildServiceTarget, findPlistPath } from './agent-targets.ts';

/** What `uninstallAgent` found: whether launchd held the agent when it was booted out. */
export interface UninstallOutcome {
  wasLoaded: boolean;
}

/** Boots the agent out and removes its plist, leaving nothing for launchd to load at the next login. */
export async function uninstallAgent(label: string): Promise<UninstallOutcome> {
  const { exitCode } = await runLaunchctl(['bootout', buildServiceTarget(label)]);
  await rm(findPlistPath(label), { force: true });

  return { wasLoaded: exitCode === 0 };
}
