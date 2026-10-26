import fs from 'node:fs';

import { readCurrentBranch } from '../git/branches.ts';
import { readRepoDir, readRepoName } from '../git/repos.ts';
import { toKebabCase } from '../portable/to-kebab-case.ts';
import { isDirectory } from '../shared/paths.ts';
import type { ProfileStateName } from './browser-process.ts';
import { type Invocation, PROCESS_LIST_RECOVERY_HINT, type ProfileRef, refuse, runTolerantly } from './invocation.ts';

/** A profile's provenance and last use. Every field but `lastUsed` is unset for a profile without a record. */
export interface ProfileFacts {
  branch: string | undefined;
  /** Epoch seconds. */
  lastUsed: number | undefined;
  origin: string | undefined;
  repo: string | undefined;
  repoDir: string | undefined;
  stale: boolean | undefined;
}

export const DEFAULT_PROFILE = 'default';

/**
 * Where a profile's provenance is recorded. It lives inside the profile, so the two share a lifetime and one removal
 * deletes both.
 */
export const PROFILE_RECORD_FILE = '.thor-chrome.record';

/**
 * Refuses when the profile is the default reached by a lost derivation rather than by a caller's choice, naming what
 * was lost. `--create` cannot produce the profile that the caller wanted, so the repair names the profile instead.
 */
export function assertProfileNotUnderived(invocation: Invocation, repairCommand: string): void {
  if (invocation.origin !== 'underived') return;
  throw refuse(
    invocation,
    'underived-profile',
    `no repository or branch resolved from the working directory, so the profile fell back to '${DEFAULT_PROFILE}'`,
    { hints: ['Name the profile instead:', `  ${repairCommand}`] },
  );
}

/**
 * Refuses when a profile's state is unknown. The process list is unreadable for every profile alike, so the first
 * profile reached refuses the invocation before anything has been signalled or removed.
 */
export function assertStateKnown(invocation: Invocation, profile: string, state: ProfileStateName): void {
  if (state !== 'unknown') return;
  invocation.resolved = { dir: `${invocation.profilesDir}/${profile}`, name: profile };
  throw refuse(
    invocation,
    'process-list-unavailable',
    `could not read the process list, so the state of profile '${profile}' is unknown`,
    { hints: [PROCESS_LIST_RECOVERY_HINT] },
  );
}

/** Refuses a profile name that would resolve outside the profiles directory or cannot name a directory. */
export function assertValidProfileName(invocation: Invocation, profile: string): void {
  if (profile === '.' || profile === '..') {
    throw refuse(
      invocation,
      'invalid-profile-name',
      `invalid profile name '${profile}': '.' and '..' do not name a profile`,
    );
  }
  if (!/^[\w.-]+$/.test(profile)) {
    throw refuse(
      invocation,
      'invalid-profile-name',
      `invalid profile name '${profile}' (letters, digits, dot, underscore and hyphen only)`,
    );
  }
}

/**
 * Returns the profile name derived from a repository and a branch, the two kebab-cased into a single path segment.
 *
 * Characters that a profile directory may not contain are dropped rather than left to fail the name check, which would
 * report a name never typed by the user.
 */
export function composeProfileName(repo: string, branch: string): string {
  return toKebabCase(`${repo}-${branch}`).replaceAll(/[^a-z0-9._-]/g, '');
}

/**
 * Reports whether the branch recorded by a derived profile is gone, which makes that profile stale.
 *
 * Every verdict is proven rather than assumed, since a sweep deletes on it. A repository directory counts as gone only
 * when its parent is searchable and the entry is absent from it: A directory test alone fails for a path that the
 * process cannot stat as well as for one that is not there, and an unmounted volume or a sandbox denying the path would
 * otherwise read as a deleted repository. A branch counts as gone only when git read the repository to say so; a
 * repository that git declines to read proves nothing about the branch.
 */
export function isBranchGone(invocation: Invocation, repoDir: string, branch: string): boolean {
  if (!isDirectory(repoDir)) {
    return isSearchable(readParentDir(repoDir)) && !fs.existsSync(repoDir);
  }
  const showRef = ['-C', repoDir, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`];
  if (runTolerantly(invocation, 'git', showRef).status === 0) return false;
  return runTolerantly(invocation, 'git', ['-C', repoDir, 'rev-parse', '--git-dir']).status === 0;
}

/** Returns the names of the profiles, sorted, or `undefined` when the profiles directory does not exist. */
export function listProfileNames(invocation: Invocation): string[] | undefined {
  if (!isDirectory(invocation.profilesDir)) return undefined;
  return fs
    .readdirSync(invocation.profilesDir)
    .filter((name) => !name.startsWith('.') && isDirectory(`${invocation.profilesDir}/${name}`))
    .toSorted();
}

/**
 * Resolves the profile on which a verb acts and records it, with its origin and the working context, on the
 * invocation: the name given, else `THOR_CHROME_PROFILE`, else the name derived from the working directory's
 * repository and branch, else the default.
 */
export function resolveDefaultProfile(invocation: Invocation, given: string): ProfileRef {
  // Both defaults come from the working directory's repository, which is not the one containing this command
  const { run } = invocation.deps;
  invocation.work = { branch: readCurrentBranch(run), repo: readRepoName(run), repoDir: readRepoDir(run) };
  const { branch, repo } = invocation.work;

  let name = given === '' ? (invocation.deps.env['THOR_CHROME_PROFILE'] ?? '') : given;
  if (name === '' && branch !== undefined && repo !== undefined) {
    name = composeProfileName(repo, branch);
    if (name !== '') invocation.origin = 'derived';
  }
  if (name === '') {
    invocation.origin = 'underived';
    name = DEFAULT_PROFILE;
  }
  assertValidProfileName(invocation, name);
  invocation.resolved = { dir: `${invocation.profilesDir}/${name}`, name };
  return invocation.resolved;
}

/**
 * Resolves the profile derived from the working directory's repository and branch and records it on the invocation,
 * never reading `THOR_CHROME_PROFILE`, so that a caller acting on the working directory's own profile cannot reach a
 * named one. Refuses a working directory from which no name derives.
 */
export function resolveDerivedProfile(invocation: Invocation, repairCommand: string): ProfileRef {
  const { run } = invocation.deps;
  invocation.work = { branch: readCurrentBranch(run), repo: readRepoName(run), repoDir: readRepoDir(run) };
  const { branch, repo } = invocation.work;
  const name = branch === undefined || repo === undefined ? '' : composeProfileName(repo, branch);
  invocation.origin = name === '' ? 'underived' : 'derived';
  assertProfileNotUnderived(invocation, repairCommand);
  invocation.resolved = { dir: `${invocation.profilesDir}/${name}`, name };
  return invocation.resolved;
}

/**
 * Reads a profile's provenance and last use.
 *
 * Staleness is `isBranchGone`'s verdict, which is reached only on proof: Nothing that a sweep cannot read is treated as
 * gone.
 *
 * Last use is the profile directory's mtime. The browser adds and removes its Singleton entries at both ends of every
 * run, so that mtime tracks the last run, and it does so for a profile predating the record as much as for one that
 * has it.
 */
export function resolveProfileFacts(invocation: Invocation, profileDir: string): ProfileFacts {
  const facts: ProfileFacts = {
    branch: undefined,
    lastUsed: readMtime(profileDir),
    origin: undefined,
    repo: undefined,
    repoDir: undefined,
    stale: undefined,
  };
  for (const [key, value] of readRecord(`${profileDir}/${PROFILE_RECORD_FILE}`)) {
    switch (key) {
      case 'branch':
        facts.branch = value;
        break;
      case 'origin':
        facts.origin = value;
        break;
      case 'repo':
        facts.repo = value;
        break;
      case 'repo_dir':
        facts.repoDir = value;
        break;
    }
  }

  // A derived record missing either field that the classification reads names nothing to look for: The profile is
  // reported as unrecorded rather than as a profile whose branch cannot be found
  if (facts.origin === 'derived' && (facts.repoDir === undefined || facts.branch === undefined)) {
    return { ...facts, branch: undefined, origin: undefined, repo: undefined, repoDir: undefined };
  }
  if (facts.origin === 'derived' && facts.repoDir !== undefined && facts.branch !== undefined) {
    facts.stale = isBranchGone(invocation, facts.repoDir, facts.branch);
  }
  if (facts.origin === 'named') facts.stale = false;
  return facts;
}

/**
 * Returns the profiles to act on: the names given, with duplicates collapsed, or the resolved default profile when none
 * is given. Every name is validated before any is acted on: An invalid one is a mistyped command line rather than a
 * state of a profile, so it refuses the whole invocation.
 */
export function selectNamedProfiles(invocation: Invocation, names: readonly string[]): string[] {
  if (names.length === 0) return [resolveDefaultProfile(invocation, '').name];
  for (const name of names) assertValidProfileName(invocation, name);
  return [...new Set(names)];
}

/**
 * Records where a profile came from, so that a later listing can tell a derived profile whose branch is gone from one
 * named by the caller. Because every launch rewrites it, a profile derived from a renamed branch is recorded under the
 * new name.
 */
export function writeProfileRecord(invocation: Invocation, profileDir: string): void {
  const { branch, repo, repoDir } = invocation.work;
  const lines = [`origin=${invocation.origin}`];
  if (invocation.origin === 'derived') {
    lines.push(`branch=${branch ?? ''}`, `repo=${repo ?? ''}`, `repo_dir=${repoDir ?? ''}`);
  }
  fs.writeFileSync(`${profileDir}/${PROFILE_RECORD_FILE}`, `${lines.join('\n')}\n`);
}

// region | Helpers

/** Reports whether the process may search a directory, which listing an entry's absence requires. */
function isSearchable(directory: string): boolean {
  try {
    fs.accessSync(directory, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Returns a path's mtime in epoch seconds, or `undefined` when the path cannot be read. */
function readMtime(value: string): number | undefined {
  try {
    return Math.floor(fs.statSync(value).mtimeMs / 1_000);
  } catch {
    return undefined;
  }
}

/** Returns the directory containing a path: `/` for a top-level entry. */
function readParentDir(value: string): string {
  const index = value.lastIndexOf('/');
  if (index === -1) return value;
  return index === 0 ? '/' : value.slice(0, index);
}

/** Returns the `key=value` lines of a record that have a value, or none when the record cannot be read. */
function readRecord(file: string): Array<[string, string]> {
  let content: string;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  return content.split('\n').flatMap((line): Array<[string, string]> => {
    const index = line.indexOf('=');
    if (index === -1 || index === line.length - 1) return [];
    return [[line.slice(0, index), line.slice(index + 1)]];
  });
}

// endregion | Helpers
