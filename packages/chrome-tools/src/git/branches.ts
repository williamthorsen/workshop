import { type RunCommand, runCommand } from '../shared/run-command.ts';

/** Returns the branch checked out in the working directory, or `undefined` on a detached HEAD or outside a repository. */
export function readCurrentBranch(run: RunCommand = runCommand): string | undefined {
  const result = run('git', ['branch', '--show-current']);
  const branch = result.status === 0 ? result.stdout.trim() : '';
  return branch === '' ? undefined : branch;
}
