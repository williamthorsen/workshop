import { type Invocation, runTolerantly } from './invocation.ts';

/** What a search of the process list found for a profile. */
export type BrowserLookup = { isReadable: false } | { isReadable: true; pid: string | undefined };

/** The process listening on a port: its PID, and a description of it as `name (PID n, user u)`. */
export interface PortListener {
  description: string;
  pid: string;
}

/** A profile's state as read from its browser process. */
export interface ProfileState {
  /** Whether the browser runs headless, unset when no browser is found. */
  isHeadless: boolean | undefined;
  pid: string | undefined;
  /** The advertised port: the proxy's for a browser served through one, else the one in the browser's argv. */
  port: string | undefined;
  /** The PID of the DevTools proxy that serves the advertised port, unset for a browser without one. */
  proxyPid: string | undefined;
  state: ProfileStateName;
}

/** A profile's DevTools proxy, as read from its argv. */
export interface ProxyProcess {
  pid: string;
  port: string;
}

/** `unknown` when the process list cannot be read; the PID and the port are set only for the states that include them. */
export type ProfileStateName = 'debugging' | 'running-without-port' | 'stopped' | 'unknown' | 'unresponsive';

/** The argv port of a browser that chooses its own port and is served through a DevTools proxy. */
export const PROXIED_PORT = '0';

/** Returns the process listening on a port, or `undefined` when the port is free. */
export function describePortListener(invocation: Invocation, port: string): PortListener | undefined {
  const result = runTolerantly(invocation, 'lsof', ['-i', `TCP:${port}`, '-s', 'TCP:LISTEN', '-n', '-P']);
  const line = result.stdout.replace(/\n+$/, '').split('\n', 2)[1];
  if (line === undefined) return undefined;
  const [command = '', pid = '', user = ''] = line.trim().split(/\s+/, 3);
  return { description: `${command} (PID ${pid}, user ${user})`, pid };
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
  const pattern = `user-data-dir=${escapeDots(profileDir)}( |$)`;
  const result = runTolerantly(invocation, 'pgrep', ['-f', pattern]);
  // pgrep exits 1 when nothing matches and 2 or 3 when it could not search at all
  if (result.status >= 2) return { isReadable: false };

  for (const pid of result.stdout.split('\n')) {
    if (pid.trim() === '') continue;
    if (!readCommandLine(invocation, pid.trim()).includes('--type=')) return { isReadable: true, pid: pid.trim() };
  }
  return { isReadable: true, pid: undefined };
}

/**
 * Returns the name of the profile whose browser or DevTools proxy a process is, read from the `--user-data-dir` or the
 * `--profile-dir` in its command line, or `undefined` for a process that serves no profile under the profiles
 * directory. The match is anchored past the directory, as in `findBrowserPid`.
 */
export function findProcessProfile(invocation: Invocation, pid: string): string | undefined {
  const commandLine = readCommandLine(invocation, pid);
  for (const prefix of [`--user-data-dir=${invocation.profilesDir}/`, `--profile-dir ${invocation.profilesDir}/`]) {
    const start = commandLine.indexOf(prefix);
    if (start === -1) continue;
    return /^[^\s/]+(?=\s|$)/.exec(commandLine.slice(start + prefix.length))?.[0];
  }
  return undefined;
}

/**
 * Finds a profile's DevTools proxy, the `serve-proxy` process that names the profile directory, with the advertised
 * port read from its argv. The `serve-proxy` token keeps the browser out of the match, and the pattern is anchored
 * past the directory, as in `findBrowserPid`.
 */
export function findProxy(invocation: Invocation, profileDir: string): ProxyProcess | undefined {
  const pattern = `serve-proxy .*--profile-dir ${escapeDots(profileDir)}( |$)`;
  const result = runTolerantly(invocation, 'pgrep', ['-f', pattern]);
  for (const line of result.stdout.split('\n')) {
    const pid = line.trim();
    if (pid === '') continue;
    const port = /\s--port (\d+)(?:\s|$)/.exec(readCommandLine(invocation, pid))?.[1];
    if (port !== undefined) return { pid, port };
  }
  return undefined;
}

/** Reports whether a Chrome DevTools endpoint answers on a port. */
export function probeDevtools(invocation: Invocation, port: string): boolean {
  const url = `http://127.0.0.1:${port}/json/version`;
  return runTolerantly(invocation, 'curl', ['--silent', '--fail', '--max-time', '1', url]).status === 0;
}

/** Reports whether a process's argv starts it headless, matching `--headless` with or without a mode. */
export function readIsHeadless(invocation: Invocation, pid: string): boolean {
  return /(?:^|\s)--headless(?:=\S*)?(?:\s|$)/.test(readCommandLine(invocation, pid));
}

/** Returns the debugging port declared in a process's argv, or `undefined` when it owns none. */
export function readDebuggingPort(invocation: Invocation, pid: string): string | undefined {
  return /--remote-debugging-port=(\d+)/.exec(readCommandLine(invocation, pid))?.[1];
}

/**
 * Reads a profile's state, PID, and port from its browser process. Both renderers read this one resolution, so neither
 * can disagree with the other about a profile.
 *
 * A browser started on port `0` is served through a DevTools proxy, whose argv contains the advertised port; without
 * one, the browser is unresponsive and has no advertised port. A browser started on any other port predates the proxy
 * and serves that port itself.
 */
export function resolveProfileState(invocation: Invocation, profileDir: string): ProfileState {
  const absent = { isHeadless: undefined, pid: undefined, port: undefined, proxyPid: undefined };
  const lookup = findBrowserPid(invocation, profileDir);
  if (!lookup.isReadable) return { ...absent, state: 'unknown' };
  const { pid } = lookup;
  if (pid === undefined) return { ...absent, state: 'stopped' };
  const isHeadless = readIsHeadless(invocation, pid);
  const argvPort = readDebuggingPort(invocation, pid);
  if (argvPort === undefined)
    return { isHeadless, pid, port: undefined, proxyPid: undefined, state: 'running-without-port' };

  const proxy = argvPort === PROXIED_PORT ? findProxy(invocation, profileDir) : undefined;
  if (argvPort === PROXIED_PORT && proxy === undefined) {
    return { isHeadless, pid, port: undefined, proxyPid: undefined, state: 'unresponsive' };
  }
  const port = proxy?.port ?? argvPort;
  const state = probeDevtools(invocation, port) ? 'debugging' : 'unresponsive';
  return { isHeadless, pid, port, proxyPid: proxy?.pid, state };
}

// region | Helpers

/** Escapes the dots of a path for a `pgrep` pattern. */
function escapeDots(path: string): string {
  return path.replaceAll('.', String.raw`\.`);
}

/** Returns a process's command line, or an empty string when it cannot be read. */
function readCommandLine(invocation: Invocation, pid: string): string {
  const result = runTolerantly(invocation, 'ps', ['-o', 'command=', '-p', pid]);
  return result.status === 0 ? result.stdout : '';
}

// endregion | Helpers
