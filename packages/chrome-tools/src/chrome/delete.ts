import fs from 'node:fs';

import { isDirectory } from '../shared/paths.ts';
import { resolveProfileState } from './browser-process.ts';
import { type Invocation, PROCESS_LIST_RECOVERY_HINT, refuse, requireCommand } from './invocation.ts';
import {
  assertProfileNotUnderived,
  assertStateKnown,
  listProfileNames,
  type ProfileFacts,
  resolveDerivedProfile,
  resolveProfileFacts,
  selectNamedProfiles,
} from './profiles.ts';
import { readQuitTimeout, terminateBrowser } from './quit.ts';
import {
  describeProfileCount,
  finishProfileReport,
  renderProfile,
  reportProfileRefusal,
  writeProse,
} from './render.ts';
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
  selection: 'all' | 'derived' | 'profile' | 'stale';
}

/**
 * Removes the named or derived profiles' directories, or every profile that a selector names, together with the
 * logins and history that each stores. `--force` quits a running profile's browser before removing it, rather than
 * refusing it.
 */
export async function deleteProfiles(invocation: Invocation, options: DeleteOptions): Promise<number> {
  const timeout = options.isForce ? readQuitTimeout(invocation) : undefined;
  requireCommand(invocation, 'curl');
  requireCommand(invocation, 'pgrep');

  if (options.selection === 'profile') {
    for (const profile of selectNamedProfiles(invocation, options.names)) {
      await deleteProfile(invocation, profile, options.isDryRun, timeout);
    }
  } else if (options.selection === 'derived') {
    await deleteDerivedProfile(invocation, options.isDryRun, timeout);
  } else {
    // Because a sweep reads what each profile recorded rather than what the working directory derives, it neither
    // resolves a profile nor fails when no derivation is available
    await sweepProfiles(invocation, options.selection, options.isDryRun, timeout);
  }
  return finishProfileReport(invocation, options.isDryRun);
}

// region | Helpers

/**
 * Removes the working directory's derived profile, and only a profile that recorded deriving from this repository and
 * branch, so that a named or unrecorded profile at the same path survives. A worktree without a profile has nothing to
 * remove, which is not a refusal.
 */
async function deleteDerivedProfile(
  invocation: Invocation,
  isDryRun: boolean,
  timeout: Timeout | undefined,
): Promise<void> {
  const { name } = invocation.output;
  const { dir, name: profile } = resolveDerivedProfile(invocation, `${name} delete <repo>-<branch>`);
  if (!isDirectory(dir)) {
    if (invocation.format === 'prose') {
      writeProse(invocation, 'stdout', [`No profile derived from this worktree (${dir}).`]);
    }
    return;
  }

  const facts = resolveProfileFacts(invocation, dir);
  const { branch, repoDir } = invocation.work;
  if (facts.origin !== 'derived' || facts.repoDir !== repoDir || facts.branch !== branch) {
    reportProfileRefusal(
      invocation,
      profile,
      {
        code: 'profile-not-derived',
        message: `profile '${profile}' is not recorded as derived from ${repoDir ?? ''} on branch '${branch ?? ''}', so --derived keeps it`,
      },
      [`Delete it by name instead: ${name} delete ${profile}`],
    );
    return;
  }

  const { pid, port, state } = resolveProfileState(invocation, dir);
  assertStateKnown(invocation, profile, state);
  if (pid !== undefined && timeout === undefined) {
    reportProfileRefusal(
      invocation,
      profile,
      { code: 'profile-running', message: `profile '${profile}' is running (PID ${pid})` },
      [`Quit it and delete it in one step: ${name} delete --derived --force`],
    );
    return;
  }
  await removeProfile(invocation, { facts, pid, port, profile }, isDryRun, timeout);
}

/** A profile on which a removal acts. */
interface RemovalTarget {
  /** Facts read before the removal, since a directory that is gone records none. */
  facts: ProfileFacts;
  pid: string | undefined;
  port: string | undefined;
  profile: string;
}

/**
 * Removes one profile's directory, or reports why it did not.
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
): Promise<void> {
  const { name } = invocation.output;
  const dir = `${invocation.profilesDir}/${profile}`;
  if (!isDirectory(dir)) {
    assertProfileNotUnderived(invocation, `${name} delete <repo>-<branch>`);
    reportProfileRefusal(
      invocation,
      profile,
      { code: 'profile-missing', message: `profile '${profile}' does not exist at ${dir}` },
      [`List existing profiles: ${name} list`],
    );
    return;
  }

  const { pid, port, state } = resolveProfileState(invocation, dir);
  assertStateKnown(invocation, profile, state);
  if (pid !== undefined && timeout === undefined) {
    reportProfileRefusal(
      invocation,
      profile,
      { code: 'profile-running', message: `profile '${profile}' is running (PID ${pid})` },
      [
        `Quit it first: ${name} quit ${profile}`,
        `Or quit it and delete it in one step: ${name} delete ${profile} --force`,
      ],
    );
    return;
  }

  // Read while the directory that contains them still exists: Removing the profile removes the record
  const facts = resolveProfileFacts(invocation, dir);
  await removeProfile(invocation, { facts, pid, port, profile }, isDryRun, timeout);
}

/**
 * Removes a profile's directory, quitting its browser first when one is running, and reports the removal. Returns
 * false, removing nothing, when the browser could not be quit. A dry run reports what it would do, and signals and
 * removes nothing.
 */
async function removeProfile(
  invocation: Invocation,
  target: RemovalTarget,
  isDryRun: boolean,
  timeout: Timeout | undefined,
): Promise<boolean> {
  const { facts, pid, port, profile } = target;
  const dir = `${invocation.profilesDir}/${profile}`;
  if (!isDryRun) {
    if (pid !== undefined && timeout !== undefined && !(await terminateBrowser(invocation, profile, pid, timeout))) {
      return false;
    }
    fs.rmSync(dir, { force: true, recursive: true });
  }

  if (invocation.format === 'json') {
    invocation.entries.push(
      renderProfile(invocation, { facts, name: profile, path: dir, pid, port, state: 'deleted' }),
    );
    return true;
  }
  const detail = pid === undefined ? dir : `PID ${pid}, ${dir}`;
  if (isDryRun) {
    const action = pid === undefined ? 'delete' : 'quit and delete';
    writeProse(invocation, 'stdout', [`Would ${action} profile '${profile}' (${detail}).`]);
  } else {
    const verb = pid === undefined ? 'Deleted' : 'Quit and deleted';
    writeProse(invocation, 'stdout', [`${verb} profile '${profile}' (${detail}).`]);
  }
  return true;
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
  selection: 'all' | 'stale',
  isDryRun: boolean,
  timeout: Timeout | undefined,
): Promise<void> {
  let deleted = 0;
  let retained = 0;
  let failed = 0;
  const profiles = listProfileNames(invocation) ?? [];
  for (const profile of profiles) {
    const dir = `${invocation.profilesDir}/${profile}`;
    // Read before the removal: A deleted profile still reports the provenance that selected it
    const facts = resolveProfileFacts(invocation, dir);
    if (selection === 'stale' && facts.stale !== true) continue;

    const { pid, port, state } = resolveProfileState(invocation, dir);
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
      retained += 1;
      if (invocation.format === 'json') {
        invocation.entries.push(
          renderProfile(invocation, { facts, name: profile, path: dir, pid, port, retained: 'running', state }),
        );
      } else {
        writeProse(invocation, 'stdout', [`Retained profile '${profile}': running (PID ${pid}).`]);
      }
      continue;
    }

    if (await removeProfile(invocation, { facts, pid, port, profile }, isDryRun, timeout)) {
      deleted += 1;
    } else {
      failed += 1;
    }
  }

  if (invocation.format === 'json') return;
  if (deleted + retained + failed === 0) {
    const sentence = selection === 'stale' ? 'No stale profiles.' : `No profiles in ${invocation.profilesDir}.`;
    writeProse(invocation, 'stdout', [sentence]);
    return;
  }
  const verb = isDryRun ? 'Would delete' : 'Deleted';
  const retainedClause = retained === 0 ? '' : `, retaining ${describeProfileCount(retained)}`;
  const failedClause = failed === 0 ? '' : `, failing to quit ${describeProfileCount(failed)}`;
  writeProse(invocation, 'stdout', [`${verb} ${describeProfileCount(deleted)}${retainedClause}${failedClause}.`]);
}

// endregion | Helpers
