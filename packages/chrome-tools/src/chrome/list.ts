import { resolveProfileState } from './browser-process.ts';
import { type Invocation, requireCommand } from './invocation.ts';
import { composeProfileEntry, listProfileNames, resolveProfileFacts } from './profiles.ts';
import type { ListResult, ProfileEntry } from './results.ts';

/** Returns every profile, or every stale one, with its running and debugging state. */
export function listProfiles(invocation: Invocation, isStaleOnly: boolean): ListResult {
  requireCommand(invocation, 'curl');
  requireCommand(invocation, 'pgrep');
  const entries = listProfileNames(invocation)?.flatMap((name): ProfileEntry[] => {
    const dir = `${invocation.profilesDir}/${name}`;
    const facts = resolveProfileFacts(invocation, dir);
    if (isStaleOnly && facts.stale !== true) return [];
    return [composeProfileEntry(invocation, name, resolveProfileState(invocation, dir), facts)];
  });
  return { entries, isStaleOnly, profilesDir: invocation.profilesDir, type: 'list' };
}
