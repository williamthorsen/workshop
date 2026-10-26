import { deriveBranchNumber } from '@williamthorsen/toolbelt.git/candidate';

import { type Invocation, refuse } from './invocation.ts';

export const DEFAULT_PORT = '9222';

/**
 * The range in which a branch-derived port falls. Because it spans a thousand ports, a ticket numbered under a
 * thousand can be read straight off the port: Branch `321` debugs on 9321.
 */
export const MAX_DERIVED_PORT = 9_999;
export const MIN_DERIVED_PORT = 9_000;

/** Refuses a port that is not a valid TCP port number. */
export function assertValidPort(invocation: Invocation, port: string): void {
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65_535) {
    throw refuse(invocation, 'invalid-port', `invalid port: ${port} (must be 1–65535)`);
  }
}

/**
 * Returns the port that a launch would use: the one given on the command line, already validated, else the one derived
 * from the working directory's branch, else the default when no branch resolved.
 */
export function resolvePort(invocation: Invocation, given: string | undefined): string {
  if (given !== undefined) return given;
  const { branch } = invocation.work;
  if (branch === undefined) return DEFAULT_PORT;
  return String(deriveBranchNumber(branch, { max: MAX_DERIVED_PORT, min: MIN_DERIVED_PORT }));
}
