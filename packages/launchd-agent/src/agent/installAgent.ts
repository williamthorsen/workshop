import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveHomebrewBin } from '../homebrew/resolveHomebrewBin.ts';
import { type AgentSpec, renderPlist } from '../plist/renderPlist.ts';
import { findAgentsDir, findPlistPath } from './agent-targets.ts';
import { readAgentState } from './readAgentState.ts';
import { replaceLoadedAgent } from './replaceLoadedAgent.ts';

/** What `installAgent` did: the plist's path, and whether it wrote the plist or loaded the agent. */
export interface InstallOutcome {
  changed: boolean;
  plistPath: string;
}

/**
 * Brings the agent up to date with the spec: writes the plist when it differs from the one on disk, and bootstraps it
 * when the plist was written or launchd does not hold the agent, replacing whatever was loaded under the same label.
 * Leaves an agent whose plist already matches and that launchd holds untouched. Rejects a spec that launchd could not
 * run before writing anything.
 */
export async function installAgent(spec: AgentSpec): Promise<InstallOutcome> {
  assertSpecIsInstallable(spec);
  const plistPath = findPlistPath(spec.label);

  await mkdir(spec.logDir, { recursive: true });
  await mkdir(findAgentsDir(), { recursive: true });

  const plist = renderPlist(spec, { homebrewBin: await resolveHomebrewBin() });
  const isPlistCurrent = (await readExistingPlist(plistPath)) === plist;
  if (isPlistCurrent && (await readAgentState(spec.label)).loaded) {
    return { changed: false, plistPath };
  }

  if (!isPlistCurrent) await writeFile(plistPath, plist);
  await replaceLoadedAgent(spec.label, plistPath);

  return { changed: true, plistPath };
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

/** Reads the plist on disk, or returns `undefined` when it cannot be read, which makes the install rewrite it. */
async function readExistingPlist(plistPath: string): Promise<string | undefined> {
  try {
    return await readFile(plistPath, 'utf8');
  } catch {
    return undefined;
  }
}

// endregion | Helpers
