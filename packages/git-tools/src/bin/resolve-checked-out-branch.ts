import { spawnSync } from 'node:child_process';

const FAILURE_PREFIX = 'Could not resolve the checked-out branch with `git branch --show-current`:';
const FAILURE_SUFFIX = 'Pass a branch name explicitly.';

/**
 * Resolves the branch checked out in the current directory. Throws when git is absent, the directory is not a
 * repository, or HEAD names no branch, since each leaves the caller without the name that it asked to derive from.
 */
export function resolveCheckedOutBranch(): string {
  const { error, status, stderr, stdout } = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' });

  if (error !== undefined) throw failToResolve(error.message);
  if (status !== 0) throw failToResolve(stderr.trim());

  const branch = stdout.trim();
  if (branch === '') throw failToResolve('HEAD names no branch.');

  return branch;
}

// region | Helpers

/**
 * Builds the one error raised by every resolution failure, naming the cause and the remedy. The remedy
 * starts its own line, since git's messages end without punctuation and would otherwise run into it.
 */
function failToResolve(cause: string): Error {
  return new Error(`${FAILURE_PREFIX} ${cause}\n${FAILURE_SUFFIX}`);
}

// endregion | Helpers
