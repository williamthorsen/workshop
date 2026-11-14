import { resolveProfileState } from './browser-process.ts';
import { type Invocation, requireCommand } from './invocation.ts';
import { assertValidPort, resolvePort } from './ports.ts';
import {
  assertProfileNotUnderived,
  composeProfileEntry,
  resolveDefaultProfile,
  type WorkOverrides,
} from './profiles.ts';
import type { StatusResult } from './results.ts';

/**
 * Returns the named or derived profile's state and the endpoint at which its browser is or would be served, applying
 * the same defaults as a launch and writing nothing, so that a caller can attach to the worktree's browser without
 * knowing how its port is derived.
 *
 * The endpoint uses the running browser's own port whenever it declares one, since a launch would open its pages in
 * that instance; otherwise it uses the port that a launch would pass. It is reported in every state, unlike the profile's
 * `devtools` field: A caller attaching ahead of a launch needs the address at which the browser will answer.
 */
export function showStatus(
  invocation: Invocation,
  profile: string | undefined,
  givenPort: string | undefined,
  work: WorkOverrides,
): StatusResult {
  const { dir, name } = resolveDefaultProfile(invocation, profile ?? '', work);
  if (givenPort !== undefined) assertValidPort(invocation, givenPort);

  requireCommand(invocation, 'curl');
  requireCommand(invocation, 'pgrep');
  assertProfileNotUnderived(invocation, `${invocation.output.name} status --repo <repo> --branch <branch>`);
  const launchPort = resolvePort(invocation, givenPort);

  const entry = composeProfileEntry(invocation, name, resolveProfileState(invocation, dir));
  return { endpoint: `http://127.0.0.1:${entry.port ?? launchPort}`, entry, type: 'status' };
}
