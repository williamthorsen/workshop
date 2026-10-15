import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveHomebrewBin } from '../homebrew/resolveHomebrewBin.ts';
import { type AgentSpec, renderPlist } from '../plist/renderPlist.ts';
import { findAgentsDir, findPlistPath } from './agent-targets.ts';
import { replaceLoadedAgent } from './replaceLoadedAgent.ts';

/**
 * Writes the agent's plist and bootstraps it, replacing whatever was loaded under the same label, and resolves with
 * the plist's path. Rejects a spec that launchd could not run before writing anything.
 */
export async function installAgent(spec: AgentSpec): Promise<string> {
  assertSpecIsInstallable(spec);
  const plistPath = findPlistPath(spec.label);

  await mkdir(spec.logDir, { recursive: true });
  await mkdir(findAgentsDir(), { recursive: true });
  await writeFile(plistPath, renderPlist(spec, { homebrewBin: await resolveHomebrewBin() }));

  await replaceLoadedAgent(spec.label, plistPath);

  return plistPath;
}

// region | Helpers

/** Throws when the label cannot name a plist file or the program is not an absolute path. */
function assertSpecIsInstallable({ label, programArguments }: AgentSpec): void {
  // The label names the plist file, so a separator would write it outside the agents directory.
  if (label === '' || label.includes('/')) {
    throw new Error(`Invalid agent label "${label}": A label must be non-empty and must not contain "/".`);
  }

  const program = programArguments[0];
  if (program === undefined || !path.isAbsolute(program)) {
    throw new Error(`Invalid program for ${label}: The first program argument must be an absolute path.`);
  }
}

// endregion | Helpers
