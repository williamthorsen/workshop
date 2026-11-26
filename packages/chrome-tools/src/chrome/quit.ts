import { isErrnoException } from '../shared/errors.ts';
import { isDirectory } from '../shared/paths.ts';
import { findBrowserPid, resolveProfileState } from './browser-process.ts';
import { type Invocation, PROCESS_LIST_RECOVERY_HINT, refuse, requireCommand } from './invocation.ts';
import {
  assertProfileNotUnderived,
  assertStateKnown,
  composeProfileEntry,
  listProfileNames,
  resolveProfileEntry,
  selectNamedProfiles,
} from './profiles.ts';
import type { OutcomeObserver, ProfileOutcome, QuitOutcome, QuitResult, RefusedOutcome } from './results.ts';
import { readTimeoutSeconds, type Timeout } from './timeouts.ts';

export const DEFAULT_QUIT_TIMEOUT_SECONDS = 3;
const QUIT_POLL_INTERVAL_MILLISECONDS = 100;

/** A profile whose browser is running, with that browser's PID, its advertised port, and its proxy's PID. */
export interface RunningProfile {
  name: string;
  pid: string;
  port: string | undefined;
  proxyPid: string | undefined;
}

/** Returns the outcome of a quit that left a profile stopped, with the PID of the browser that it ended, if any. */
export function composeQuitOutcome(
  invocation: Invocation,
  profile: string,
  pid: string | undefined,
  isIdle: boolean,
): QuitOutcome {
  const state = { isHeadless: undefined, pid, port: undefined, state: 'stopped' } as const;
  return { entry: composeProfileEntry(invocation, profile, state), isIdle, type: 'quit' };
}

/** Returns the profiles whose browser is running, refusing before anything is quit when the process list is unreadable. */
export function listRunningProfiles(invocation: Invocation): RunningProfile[] {
  return (listProfileNames(invocation) ?? []).flatMap((name): RunningProfile[] => {
    const { pid, port, proxyPid, state } = resolveProfileState(invocation, `${invocation.profilesDir}/${name}`);
    if (state === 'unknown') {
      throw refuse(
        invocation,
        'process-list-unavailable',
        "could not read the process list, so no profile's state is known and nothing was quit",
        { hints: [PROCESS_LIST_RECOVERY_HINT] },
      );
    }
    return pid === undefined ? [] : [{ name, pid, port, proxyPid }];
  });
}

/**
 * Terminates the browsers of the named or derived profiles, or of every running profile, refusing each profile that it
 * cannot act on separately, so that a refusal of one does not stop the rest.
 */
export async function quitProfiles(
  invocation: Invocation,
  names: readonly string[],
  isAll: boolean,
  onOutcome: OutcomeObserver = () => {},
): Promise<QuitResult> {
  const timeout = readQuitTimeout(invocation);
  requireCommand(invocation, 'curl');
  requireCommand(invocation, 'pgrep');

  const profiles = isAll
    ? listRunningProfiles(invocation).map((profile) => profile.name)
    : selectNamedProfiles(invocation, names);
  const outcomes: ProfileOutcome[] = [];
  for (const profile of profiles) {
    const outcome = await quitProfile(invocation, profile, timeout);
    outcomes.push(outcome);
    onOutcome(outcome);
  }
  return { isAll, outcomes, type: 'quit' };
}

/** Reads the budget within which a quit waits for the browser to exit. */
export function readQuitTimeout(invocation: Invocation): Timeout {
  return readTimeoutSeconds(invocation, 'THOR_CHROME_QUIT_TIMEOUT', DEFAULT_QUIT_TIMEOUT_SECONDS);
}

/** Returns the refusal of one profile, with its entry as read at the refusal. */
export function refuseProfile(
  invocation: Invocation,
  profile: string,
  error: { code: string; message: string },
  hints: readonly string[] = [],
): RefusedOutcome {
  return { entry: resolveProfileEntry(invocation, profile), error, hints, type: 'refused' };
}

/**
 * Terminates a profile's browser, and its DevTools proxy when it has one, and waits for both to exit, returning the
 * profile's refusal when it could not. A process that exited before the signal reached it counts as stopped.
 *
 * Waiting means that a quit followed by a relaunch, which the guard messages recommend, does not race the relaunch
 * against a browser that is still shutting down, or against a proxy that still holds the advertised port. Because
 * SIGTERM to Chrome is asynchronous, the wait polls; the bound is wall-clock rather than a count of attempts, since
 * each attempt runs a pgrep and a ps, whose duration varies with machine load.
 */
export async function terminateBrowser(
  invocation: Invocation,
  profile: string,
  pid: string,
  timeout: Timeout,
  proxyPid?: string,
): Promise<RefusedOutcome | undefined> {
  const { deps } = invocation;
  const startedMilliseconds = deps.now();
  const signals = [pid, ...(proxyPid === undefined ? [] : [proxyPid])].map((target) =>
    signalProcess(invocation, profile, target),
  );
  for (const signal of signals) if (typeof signal !== 'string') return signal;

  // Skip a wait for a process that was already gone: One relaunched on the profile would otherwise time out under it
  const dir = `${invocation.profilesDir}/${profile}`;
  for (;;) {
    const isBrowserRunning = signals[0] === 'signalled' && isRunning(invocation, dir);
    const isProxyRunning =
      proxyPid !== undefined && signals[1] === 'signalled' && deps.isProcessAlive(Number(proxyPid));
    if (!isBrowserRunning && !isProxyRunning) return undefined;
    if (deps.now() - startedMilliseconds > timeout.seconds * 1000) {
      const remaining = isBrowserRunning ? `PID ${pid}` : `the DevTools proxy (PID ${proxyPid ?? ''})`;
      return refuseProfile(invocation, profile, {
        code: 'quit-timeout',
        message: `${remaining} for profile '${profile}' is still running ${timeout.text}s after SIGTERM; end it manually`,
      });
    }
    await deps.sleep(QUIT_POLL_INTERVAL_MILLISECONDS);
  }
}

// region | Helpers

/** Reports whether a profile's browser is still found in the process list. */
function isRunning(invocation: Invocation, dir: string): boolean {
  const lookup = findBrowserPid(invocation, dir);
  return lookup.isReadable && lookup.pid !== undefined;
}

/**
 * Terminates one profile's browser and returns what it did, leaving instances on other profiles running.
 */
async function quitProfile(invocation: Invocation, profile: string, timeout: Timeout): Promise<ProfileOutcome> {
  const { programName: name } = invocation;
  const dir = `${invocation.profilesDir}/${profile}`;
  if (!isDirectory(dir)) {
    assertProfileNotUnderived(invocation, `${name} quit <repo>-<branch>`);
    return refuseProfile(
      invocation,
      profile,
      { code: 'profile-missing', message: `profile '${profile}' does not exist at ${dir}` },
      [`List existing profiles: ${name} list`],
    );
  }

  const { pid, proxyPid, state } = resolveProfileState(invocation, dir);
  assertStateKnown(invocation, profile, state);
  if (pid === undefined) return composeQuitOutcome(invocation, profile, undefined, false);
  return (
    (await terminateBrowser(invocation, profile, pid, timeout, proxyPid)) ??
    composeQuitOutcome(invocation, profile, pid, false)
  );
}

/**
 * Sends SIGTERM to one process of a profile and returns whether it was signalled or already gone, or the profile's
 * refusal when this user may not signal it.
 */
function signalProcess(invocation: Invocation, profile: string, pid: string): RefusedOutcome | 'gone' | 'signalled' {
  try {
    invocation.deps.kill(Number(pid));
    return 'signalled';
  } catch (error) {
    if (!isErrnoException(error)) throw error;
    if (error.code === 'ESRCH') return 'gone';
    if (error.code !== 'EPERM') throw error;
    return refuseProfile(invocation, profile, {
      code: 'quit-failed',
      message: `not permitted to signal PID ${pid} for profile '${profile}'; end it from a terminal outside the sandbox, or as the user who owns it`,
    });
  }
}

// endregion | Helpers
