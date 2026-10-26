import { type RunCommand, runCommand } from '../shared/run-command.ts';

/**
 * Returns the absolute path of the working directory's main checkout, or `undefined` outside a repository.
 *
 * It resolves from the common git directory rather than the worktree's own top level, so every worktree of a repository
 * reports one path: the main checkout from the main checkout and from a `macos.321` worktree alike. Because that path
 * outlives the worktrees, it is the one to record for a repository that has to be found again later.
 */
export function readRepoDir(run: RunCommand = runCommand): string | undefined {
  const result = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const commonDir = result.status === 0 ? result.stdout.replace(/\n+$/, '') : '';
  if (commonDir === '') return undefined;
  return commonDir.slice(0, commonDir.lastIndexOf('/'));
}

/** Returns the directory name of the working directory's main checkout, or `undefined` outside a repository. */
export function readRepoName(run: RunCommand = runCommand): string | undefined {
  const directory = readRepoDir(run);
  return directory === undefined ? undefined : directory.slice(directory.lastIndexOf('/') + 1);
}
