import { resolveProfileState } from './browser-process.ts';
import { type Invocation, requireCommand } from './invocation.ts';
import { assertValidPort, resolvePort } from './ports.ts';
import { assertProfileNotUnderived, resolveDefaultProfile } from './profiles.ts';
import { renderProfile, warnProcessListUnavailable, writeJson, writeProse } from './render.ts';

/**
 * Reports the named or derived profile's state and the endpoint at which its browser is or would be served, applying
 * the same defaults as a launch and writing nothing, so that a caller can attach to the worktree's browser without
 * knowing how its port is derived.
 *
 * The endpoint uses the running browser's own port whenever it declares one, since a launch would be forwarded to that
 * instance; otherwise it uses the port that a launch would pass. It is reported in every state, unlike the profile's
 * `devtools` field: A caller attaching ahead of a launch needs the address at which the browser will answer.
 */
export function showStatus(invocation: Invocation, profile: string | undefined, givenPort: string | undefined): number {
  const { dir, name } = resolveDefaultProfile(invocation, profile ?? '');
  if (givenPort !== undefined) assertValidPort(invocation, givenPort);

  requireCommand(invocation, 'curl');
  requireCommand(invocation, 'pgrep');
  assertProfileNotUnderived(invocation, `${invocation.output.name} status <repo>-<branch>`);
  const launchPort = resolvePort(invocation, givenPort);

  const { pid, port, state } = resolveProfileState(invocation, dir);
  const endpoint = `http://127.0.0.1:${port ?? launchPort}`;
  if (invocation.format === 'json') {
    writeJson(invocation, { profile: renderProfile(invocation, { name, path: dir, pid, port, state }), endpoint });
    return 0;
  }
  writeProse(invocation, 'stdout', [`${name}: ${state}, endpoint ${endpoint}`]);
  if (state === 'unknown') warnProcessListUnavailable(invocation, 'status');
  return 0;
}
