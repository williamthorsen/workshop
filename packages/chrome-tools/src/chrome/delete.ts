import fs from 'node:fs';

import { isDirectory } from '../shared/paths.ts';
import { resolveProfileState } from './browser-process.ts';
import { type Invocation, PROCESS_LIST_RECOVERY_HINT, refuse, requireCommand } from './invocation.ts';
import {
  assertProfileNotUnderived,
  assertStateKnown,
  composeProfileEntry,
  listProfileNames,
  type ProfileFacts,
  resolveDerivedProfile,
  resolveProfileFacts,
  selectNamedProfiles,
} from './profiles.ts';
import { readQuitTimeout, refuseProfile, terminateBrowser } from './quit.ts';
import type { DeleteResult, DeleteSelection, OutcomeObserver, ProfileOutcome } from './results.ts';
import type { Timeout } from './timeouts.ts';

/** The options of a delete, as parsed from its command line. */
export interface DeleteOptions {
  isDryRun: boolean;
  isForce: boolean;
  names: readonly string[];
  /**
   * `profile` acts on the names given; `derived` acts on the working directory's derived profile alone; `stale` and
   * `all` select a set of profiles instead.
   */
  selection: DeleteSelection;
}

/**
 * Removes the named or derived profiles' directories, or every profile that a selector names, together with the
 * logins and history that each stores. `--force` quits a running profile's browser before removing it, rather than
 * refusing it.
 */
export async function deleteProfiles(
  invocation: Invocation,
  options: DeleteOptions,
  onOutcome: OutcomeObserver = () => {},
): Promise<DeleteResult> {
  const { isDryRun, selection } = options;
  const timeout = options.isForce ? readQuitTimeout(invocation) : undefined;
  requireCommand(invocation, 'curl');
  requireCommand(invocation, 'pgrep');

  const outcomes: ProfileOutcome[] = [];
  const report: OutcomeObserver = (outcome) => {
    outcomes.push(outcome);
    onOutcome(outcome);
  };
  let missingDerivedDir: string | undefined;
  if (selection === 'profile') {
    for (const profile of selectNamedProfiles(invocation, options.names)) {
      report(await deleteProfile(invocation, profile, isDryRun, timeout));
    }
  } else if (selection === 'derived') {
    const { programName: name } = invocation;
    const { dir, name: profile } = resolveDerivedProfile(invocation, `${name} delete <repo>-<branch>`);
    // A worktree without a profile has nothing to remove, which is not a refusal
    if (isDirectory(dir)) {
      report(await deleteDerivedProfile(invocation, profile, isDryRun, timeout));
    } else {
      missingDerivedDir = dir;
    }
  } else {
    // Because a sweep reads what each profile recorded rather than what the working directory derives, it neither
    // resolves a profile nor fails when no derivation is available
    await sweepProfiles(invocation, { isDryRun, report, selection, timeout });
  }
  return { isDryRun, missingDerivedDir, outcomes, profilesDir: invocation.profilesDir, selection, type: 'delete' };
}

// region | Helpers

/**
 * Removes the working directory's derived profile, and only a profile that recorded deriving from this repository and
 * branch, so that a named or unrecorded profile at the same path survives.
 */
async function deleteDerivedProfile(
  invocation: Invocation,
  profile: string,
  isDryRun: boolean,
  timeout: Timeout | undefined,
): Promise<ProfileOutcome> {
  const { programName: name } = invocation;
  const dir = `${invocation.profilesDir}/${profile}`;
  const facts = resolveProfileFacts(invocation, dir);
  const { branch, repoDir } = invocation.work;
  if (facts.origin !== 'derived' || facts.repoDir !== repoDir || facts.branch !== branch) {
    return refuseProfile(
      invocation,
      profile,
      {
        code: 'profile-not-derived',
        message: `profile '${profile}' is not recorded as derived from ${repoDir ?? ''} on branch '${branch ?? ''}', so --derived keeps it`,
      },
      [`Delete it by name instead: ${name} delete ${profile}`],
    );
  }

  const { pid, port, proxyPid, state } = resolveProfileState(invocation, dir);
  assertStateKnown(invocation, profile, state);
  if (pid !== undefined && timeout === undefined) {
    return refuseProfile(
      invocation,
      profile,
      { code: 'profile-running', message: `profile '${profile}' is running (PID ${pid})` },
      [`Quit it and delete it in one step: ${name} delete --derived --force`],
    );
  }
  return removeProfile(invocation, { facts, pid, port, profile, proxyPid }, isDryRun, timeout);
}

/** A profile on which a removal acts. */
interface RemovalTarget {
  /** Facts read before the removal, since a directory that is gone records none. */
  facts: ProfileFacts;
  pid: string | undefined;
  port: string | undefined;
  profile: string;
  proxyPid: string | undefined;
}

/**
 * Removes one profile's directory, or returns why it did not.
 *
 * Refuses while the profile's browser is running unless the caller forces a quit first, since a delete that ends a
 * browser with unsaved state fails worse than one that stops. A dry run passes the same refusals before reporting the
 * directory that it would remove, so what it reports is what a real run would do.
 */
async function deleteProfile(
  invocation: Invocation,
  profile: string,
  isDryRun: boolean,
  timeout: Timeout | undefined,
): Promise<ProfileOutcome> {
  const { programName: name } = invocation;
  const dir = `${invocation.profilesDir}/${profile}`;
  if (!isDirectory(dir)) {
    assertProfileNotUnderived(invocation, `${name} delete <repo>-<branch>`);
    return refuseProfile(
      invocation,
      profile,
      { code: 'profile-missing', message: `profile '${profile}' does not exist at ${dir}` },
      [`List existing profiles: ${name} list`],
    );
  }

  const { pid, port, proxyPid, state } = resolveProfileState(invocation, dir);
  assertStateKnown(invocation, profile, state);
  if (pid !== undefined && timeout === undefined) {
    return refuseProfile(
      invocation,
      profile,
      { code: 'profile-running', message: `profile '${profile}' is running (PID ${pid})` },
      [
        `Quit it first: ${name} quit ${profile}`,
        `Or quit it and delete it in one step: ${name} delete ${profile} --force`,
      ],
    );
  }

  // Read while the directory that contains them still exists: Removing the profile removes the record
  const facts = resolveProfileFacts(invocation, dir);
  return removeProfile(invocation, { facts, pid, port, profile, proxyPid }, isDryRun, timeout);
}

/**
 * Removes a profile's directory, quitting its browser first when one is running, and returns the removal, or the
 * refusal of a browser that could not be quit, which removes nothing. A dry run returns what it would do, and signals
 * and removes nothing.
 */
async function removeProfile(
  invocation: Invocation,
  target: RemovalTarget,
  isDryRun: boolean,
  timeout: Timeout | undefined,
): Promise<ProfileOutcome> {
  const { facts, pid, port, profile, proxyPid } = target;
  if (!isDryRun) {
    const refusal =
      pid === undefined || timeout === undefined
        ? undefined
        : await terminateBrowser(invocation, profile, pid, timeout, proxyPid);
    if (refusal !== undefined) return refusal;
    fs.rmSync(`${invocation.profilesDir}/${profile}`, { force: true, recursive: true });
  }
  const state = { isHeadless: undefined, pid, port, state: 'deleted' } as const;
  return { entry: composeProfileEntry(invocation, profile, state, facts), isDryRun, type: 'deleted' };
}

/**
 * Deletes every profile that a selector names, reporting each one that it removed and each one that it kept.
 *
 * A running profile is retained rather than refused unless the caller forces a quit: The caller named a set, and a
 * sweep that met one live browser has still cleared the rest. A named profile keeps its refusal: A caller who named
 * one profile and got nothing has been refused outright.
 */
async function sweepProfiles(
  invocation: Invocation,
  sweep: {
    isDryRun: boolean;
    report: OutcomeObserver;
    selection: 'all' | 'stale';
    timeout: Timeout | undefined;
  },
): Promise<void> {
  const { isDryRun, report, selection, timeout } = sweep;
  const profiles = listProfileNames(invocation) ?? [];
  for (const profile of profiles) {
    const dir = `${invocation.profilesDir}/${profile}`;
    // Read before the removal: A deleted profile still reports the provenance that selected it
    const facts = resolveProfileFacts(invocation, dir);
    if (selection === 'stale' && facts.stale !== true) continue;

    const profileState = resolveProfileState(invocation, dir);
    const { pid, port, proxyPid, state } = profileState;
    // The lookup fails alike for every profile, so the first one refuses the sweep before anything is deleted
    if (state === 'unknown') {
      throw refuse(
        invocation,
        'process-list-unavailable',
        "could not read the process list, so no profile's state is known and the sweep deleted nothing",
        { hints: [PROCESS_LIST_RECOVERY_HINT] },
      );
    }
    if (pid !== undefined && timeout === undefined) {
      report({ entry: composeProfileEntry(invocation, profile, profileState, facts), type: 'retained' });
      continue;
    }
    report(await removeProfile(invocation, { facts, pid, port, profile, proxyPid }, isDryRun, timeout));
  }
}

// endregion | Helpers
