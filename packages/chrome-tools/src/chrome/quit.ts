import { isDirectory } from '../shared/paths.ts';
import { findBrowserPid, resolveProfileState } from './browser-process.ts';
import { type Invocation, PROCESS_LIST_RECOVERY_HINT, refuse, requireCommand } from './invocation.ts';
import { assertProfileNotUnderived, assertStateKnown, listProfileNames, selectNamedProfiles } from './profiles.ts';
import { finishProfileReport, renderProfile, reportProfileRefusal, writeProse } from './render.ts';
import { readTimeoutSeconds, type Timeout } from './timeouts.ts';

export const DEFAULT_QUIT_TIMEOUT_SECONDS = 3;
const QUIT_POLL_INTERVAL_MILLISECONDS = 100;

/** A profile whose browser is running, with that browser's PID and debugging port. */
export interface RunningProfile {
  name: string;
  pid: string;
  port: string | undefined;
}

/** Returns the profiles whose browser is running, refusing before anything is quit when the process list is unreadable. */
export function listRunningProfiles(invocation: Invocation): RunningProfile[] {
  return (listProfileNames(invocation) ?? []).flatMap((name): RunningProfile[] => {
    const { pid, port, state } = resolveProfileState(invocation, `${invocation.profilesDir}/${name}`);
    if (state === 'unknown') {
      throw refuse(
        invocation,
        'process-list-unavailable',
        "could not read the process list, so no profile's state is known and nothing was quit",
        { hints: [PROCESS_LIST_RECOVERY_HINT] },
      );
    }
    return pid === undefined ? [] : [{ name, pid, port }];
  });
}

/**
 * Terminates the browsers of the named or derived profiles, or of every running profile, refusing each profile that it
 * cannot act on separately, so that a refusal of one does not stop the rest.
 */
export async function quitProfiles(invocation: Invocation, names: readonly string[], isAll: boolean): Promise<number> {
  const timeout = readQuitTimeout(invocation);
  requireCommand(invocation, 'curl');
  requireCommand(invocation, 'pgrep');

  const profiles = isAll
    ? listRunningProfiles(invocation).map((profile) => profile.name)
    : selectNamedProfiles(invocation, names);
  if (isAll && profiles.length === 0 && invocation.format === 'prose') {
    writeProse(invocation, 'stdout', ['No running profiles.']);
  }
  for (const profile of profiles) await quitProfile(invocation, profile, timeout);
  return finishProfileReport(invocation, false);
}

/** Reads the budget within which a quit waits for the browser to exit. */
export function readQuitTimeout(invocation: Invocation): Timeout {
  return readTimeoutSeconds(invocation, 'THOR_CHROME_QUIT_TIMEOUT', DEFAULT_QUIT_TIMEOUT_SECONDS);
}

/** Reports a profile that the quit left stopped, as its entry under `--json` or as a sentence. */
export function reportQuit(invocation: Invocation, profile: string, pid: string | undefined, sentence: string): void {
  if (invocation.format === 'json') {
    const path = `${invocation.profilesDir}/${profile}`;
    invocation.entries.push(renderProfile(invocation, { name: profile, path, pid, port: undefined, state: 'stopped' }));
    return;
  }
  writeProse(invocation, 'stdout', [sentence]);
}

/**
 * Terminates a profile's browser and waits for it to exit, returning false when it could not, having reported the
 * refusal for the profile.
 *
 * Waiting means that a quit followed by a relaunch, which the guard messages recommend, does not race the relaunch
 * against a browser that is still shutting down. Because SIGTERM to Chrome is asynchronous, the wait polls; the bound
 * is wall-clock rather than a count of attempts, since each attempt runs a pgrep and a ps, whose duration varies with
 * machine load.
 */
export async function terminateBrowser(
  invocation: Invocation,
  profile: string,
  pid: string,
  timeout: Timeout,
): Promise<boolean> {
  const { deps } = invocation;
  try {
    deps.kill(Number(pid));
  } catch {
    reportProfileRefusal(invocation, profile, {
      code: 'quit-failed',
      message: `could not signal PID ${pid} for profile '${profile}'`,
    });
    return false;
  }

  const started = deps.now();
  const dir = `${invocation.profilesDir}/${profile}`;
  while (isRunning(invocation, dir)) {
    if (deps.now() - started > timeout.seconds * 1_000) {
      reportProfileRefusal(invocation, profile, {
        code: 'quit-timeout',
        message: `PID ${pid} for profile '${profile}' is still running ${timeout.text}s after SIGTERM; end it manually`,
      });
      return false;
    }
    await deps.sleep(QUIT_POLL_INTERVAL_MILLISECONDS);
  }
  return true;
}

// region | Helpers

/** Reports whether a profile's browser is still found in the process list. */
function isRunning(invocation: Invocation, dir: string): boolean {
  const lookup = findBrowserPid(invocation, dir);
  return lookup.isReadable && lookup.pid !== undefined;
}

/**
 * Terminates one profile's browser and reports it, or reports why it did not, leaving instances on other profiles
 * running.
 */
async function quitProfile(invocation: Invocation, profile: string, timeout: Timeout): Promise<void> {
  const { name } = invocation.output;
  const dir = `${invocation.profilesDir}/${profile}`;
  if (!isDirectory(dir)) {
    assertProfileNotUnderived(invocation, `${name} quit <repo>-<branch>`);
    reportProfileRefusal(
      invocation,
      profile,
      { code: 'profile-missing', message: `profile '${profile}' does not exist at ${dir}` },
      [`List existing profiles: ${name} list`],
    );
    return;
  }

  const { pid, state } = resolveProfileState(invocation, dir);
  assertStateKnown(invocation, profile, state);
  if (pid === undefined) {
    reportQuit(invocation, profile, undefined, `Profile '${profile}' is not running.`);
    return;
  }
  if (!(await terminateBrowser(invocation, profile, pid, timeout))) return;
  reportQuit(invocation, profile, pid, `Quit profile '${profile}' (PID ${pid}).`);
}

// endregion | Helpers
