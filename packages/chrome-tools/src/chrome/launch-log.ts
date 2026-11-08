import fs from 'node:fs';

import type { Invocation } from './invocation.ts';

/** Verbatim fragment of the message printed by a browser when the RemoteDebuggingAllowed policy denies the port. */
export const POLICY_DENIAL_MESSAGE = 'disallowed by the system admin';

/** Returns a file's content, or an empty string when it cannot be read. */
export function readLogFile(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/** Returns the path of the file that contains a profile's most recent launch output. */
export function resolveLogPath(invocation: Invocation, profile: string): string {
  return `${invocation.deps.env['TMPDIR'] || '/tmp'}/thor-chrome-${profile}.log`;
}
