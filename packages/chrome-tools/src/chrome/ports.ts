import { findBranchTicketRef } from '@williamthorsen/toolbelt.git/candidate';
import { hashString } from '@williamthorsen/toolbelt.strings/candidate';

import { type Invocation, refuse } from './invocation.ts';

/** An inclusive range of ports. */
export interface PortRange {
  max: number;
  min: number;
}

export const DEFAULT_PORT = '9222';

/**
 * The range in which the port of a branch that encodes no ticket falls, hashed from the repository and the branch. It
 * lies apart from the ticket range, so that a hashed port never takes a ticket's port and the two kinds stay
 * recognizable, and below 49152, where macOS starts assigning ephemeral ports.
 */
export const HASH_PORT_RANGE: PortRange = { max: 39_999, min: 30_000 };

/**
 * The range in which the port of a branch that encodes a ticket falls. Because it spans ten thousand ports, a ticket
 * numbered under ten thousand reads off the port's last four digits: Branch `321` debugs on 20321.
 */
export const TICKET_PORT_RANGE: PortRange = { max: 29_999, min: 20_000 };

/** Refuses a port that is not a valid TCP port number. */
export function assertValidPort(invocation: Invocation, port: string): void {
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65_535) {
    throw refuse(invocation, 'invalid-port', `invalid port: ${port} (must be 1–65535)`);
  }
}

/**
 * Derives a branch's debugging port: the ticket that the branch encodes, wrapped into the ticket range, else a hash of
 * `<repo>/<branch>` within the hash range, or of the bare branch when the repository is unknown.
 *
 * The branch is classified by its own name, so that a repository whose name begins with digits is not read as a
 * ticket.
 */
export function derivePort(branch: string, repo: string | undefined): number {
  const ref = findBranchTicketRef(branch);
  if (ref !== undefined) {
    const { max, min } = TICKET_PORT_RANGE;
    return min + (ref.number % (max - min + 1));
  }
  return hashString(repo === undefined ? branch : `${repo}/${branch}`, HASH_PORT_RANGE);
}

/**
 * Returns the port that a launch would use: the one given on the command line, already validated, else the one derived
 * from the working context's repository and branch, else the default when no branch resolved.
 */
export function resolvePort(invocation: Invocation, given: string | undefined): string {
  if (given !== undefined) return given;
  const { branch, repo } = invocation.work;
  if (branch === undefined) return DEFAULT_PORT;
  return String(derivePort(branch, repo));
}
