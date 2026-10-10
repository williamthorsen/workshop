import { spawnSync } from 'node:child_process';
import path from 'node:path';

/** Lists the paths that git tracks in a clone, relative to its root, or returns `undefined` when git cannot. */
export function listTrackedFiles(cloneDir: string): string[] | undefined {
  const output = runGit(cloneDir, ['ls-files', '-z']);
  return output?.split('\0').filter((trackedPath) => trackedPath !== '');
}

/**
 * Returns the root of the clone's main worktree for a directory in any of its worktrees, or `undefined` when the
 * directory is in no checkout. A checkout whose git directory is not a `.git` beside its root, such as a submodule or
 * a worktree of a bare repository, has no main worktree, and its own root is returned.
 */
export function readCloneRoot(dir: string): string | undefined {
  const topLevel = runGit(dir, ['rev-parse', '--show-toplevel'])?.trim();
  if (!topLevel) return undefined;
  const commonDir = runGit(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir'])?.trim();
  return commonDir !== undefined && path.basename(commonDir) === '.git' ? path.dirname(commonDir) : topLevel;
}

/** Returns the branch checked out in the checkout containing a directory, or `undefined` when HEAD is detached. */
export function readCurrentBranch(dir: string): string | undefined {
  // `symbolic-ref` also names the unborn branch of a repository without commits, which `rev-parse` cannot.
  return runGit(dir, ['symbolic-ref', '--quiet', '--short', 'HEAD'])?.trim() || undefined;
}

/** Returns the URL of a clone's `origin` remote, or `undefined` when it has none. */
export function readOriginUrl(cloneDir: string): string | undefined {
  return runGit(cloneDir, ['remote', 'get-url', 'origin'])?.trim() || undefined;
}

// region | Helpers

/** Runs git in a directory and returns its stdout, or `undefined` when it exits non-zero. */
function runGit(dir: string, args: readonly string[]): string | undefined {
  const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return result.status === 0 ? result.stdout : undefined;
}

// endregion | Helpers
