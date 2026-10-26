import { type Invocation, runTolerantly } from './invocation.ts';

/** What a search of the process list found for a profile. */
export type BrowserLookup = { isReadable: false } | { isReadable: true; pid: string | undefined };

/** A profile's state as read from its browser process. */
export interface ProfileState {
  pid: string | undefined;
  port: string | undefined;
  state: ProfileStateName;
}

/** `unknown` when the process list cannot be read; the PID and the port are set only for the states that include them. */
export type ProfileStateName = 'debugging' | 'running-without-port' | 'stopped' | 'unknown' | 'unresponsive';

/** Returns the listening process on a port as `name (PID n, user u)`, or an empty string when the port is free. */
export function describePortListener(invocation: Invocation, port: string): string {
  const result = runTolerantly(invocation, 'lsof', ['-i', `TCP:${port}`, '-s', 'TCP:LISTEN', '-n', '-P']);
  const line = result.stdout.replace(/\n+$/, '').split('\n', 2)[1];
  if (line === undefined) return '';
  const [command = '', pid = '', user = ''] = line.trim().split(/\s+/, 3);
  return `${command} (PID ${pid}, user ${user})`;
}

/**
 * Finds the PID of a profile's browser process. The lookup is unreadable when `pgrep` cannot search at all, as under a
 * sandbox that denies it the lookup of sysmond.
 *
 * Every Chrome process for a profile has `--user-data-dir` in argv; helpers additionally have `--type=`, which leaves
 * the browser as the sole match without it. The pattern is anchored past the directory so that profile `thrive` does
 * not match `thrive-2`.
 */
export function findBrowserPid(invocation: Invocation, profileDir: string): BrowserLookup {
  const pattern = `user-data-dir=${profileDir.replaceAll('.', String.raw`\.`)}( |$)`;
  const result = runTolerantly(invocation, 'pgrep', ['-f', pattern]);
  // pgrep exits 1 when nothing matches and 2 or 3 when it could not search at all
  if (result.status >= 2) return { isReadable: false };

  for (const pid of result.stdout.split('\n')) {
    if (pid.trim() === '') continue;
    if (!readCommandLine(invocation, pid.trim()).includes('--type=')) return { isReadable: true, pid: pid.trim() };
  }
  return { isReadable: true, pid: undefined };
}

/** Reports whether a Chrome DevTools endpoint answers on a port. */
export function probeDevtools(invocation: Invocation, port: string): boolean {
  const url = `http://127.0.0.1:${port}/json/version`;
  return runTolerantly(invocation, 'curl', ['--silent', '--fail', '--max-time', '1', url]).status === 0;
}

/** Returns the debugging port declared in a process's argv, or `undefined` when it owns none. */
export function readDebuggingPort(invocation: Invocation, pid: string): string | undefined {
  return /--remote-debugging-port=(\d+)/.exec(readCommandLine(invocation, pid))?.[1];
}

/**
 * Reads a profile's state, PID, and port from its browser process. Both renderers read this one resolution, so neither
 * can disagree with the other about a profile.
 */
export function resolveProfileState(invocation: Invocation, profileDir: string): ProfileState {
  const lookup = findBrowserPid(invocation, profileDir);
  if (!lookup.isReadable) return { pid: undefined, port: undefined, state: 'unknown' };
  const { pid } = lookup;
  if (pid === undefined) return { pid: undefined, port: undefined, state: 'stopped' };
  const port = readDebuggingPort(invocation, pid);
  if (port === undefined) return { pid, port: undefined, state: 'running-without-port' };
  return { pid, port, state: probeDevtools(invocation, port) ? 'debugging' : 'unresponsive' };
}

// region | Helpers

/** Returns a process's command line, or an empty string when it cannot be read. */
function readCommandLine(invocation: Invocation, pid: string): string {
  const result = runTolerantly(invocation, 'ps', ['-o', 'command=', '-p', pid]);
  return result.status === 0 ? result.stdout : '';
}

// endregion | Helpers
