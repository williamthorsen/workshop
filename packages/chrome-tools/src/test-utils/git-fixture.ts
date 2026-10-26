import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { makeFixtureDir } from './fixture-dir.ts';

/** A bare remote and a clone of it, whose checked-out branch, `feature`, has no upstream. */
export interface GitFixture {
  clone: string;
  /** An environment in which git reads neither the user's nor the system's config. */
  env: NodeJS.ProcessEnv;
  remote: string;
  root: string;
}

/** The variables that keep git from reading the user's and the system's config, and that name a fixture author. */
export const ISOLATED_GIT_ENV: Readonly<Record<string, string>> = {
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

/** Builds a bare remote and a clone with one commit on `main`, pushed, and `feature` created from it and checked out. */
export function makeGitFixture(): GitFixture {
  const root = makeFixtureDir();
  const remote = path.join(root, 'remote.git');
  const clone = path.join(root, 'clone');
  const env: NodeJS.ProcessEnv = { ...process.env, ...ISOLATED_GIT_ENV };
  function git(...args: string[]) {
    return runGit(args, env);
  }

  git('init', '--quiet', '--bare', remote);
  git('init', '--quiet', '--initial-branch=main', clone);
  git('-C', clone, 'commit', '--quiet', '--allow-empty', '--message', 'Initial commit');
  git('-C', clone, 'remote', 'add', 'origin', remote);
  git('-C', clone, 'push', '--quiet', 'origin', 'main');
  git('-C', clone, 'switch', '--quiet', '--create', 'feature');
  return { clone, env, remote, root };
}

/** Runs git with its output captured and returns its trimmed stdout; a failure throws with git's stderr. */
export function runGit(args: readonly string[], env: NodeJS.ProcessEnv): string {
  const result = spawnSync('git', args, { encoding: 'utf8', env });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || String(result.error)}`);
  }
  return result.stdout.trim();
}
