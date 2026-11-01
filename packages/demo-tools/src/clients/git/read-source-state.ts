import { spawnSync } from 'node:child_process';

/** The commit that a work tree is at, and whether it has changes, untracked files included. */
export interface SourceState {
  readonly commit: string;
  readonly dirty: boolean;
}

/** Reads the state of the git work tree that contains `dir`, or `undefined` outside one or before its first commit. */
export function readSourceState(dir: string): SourceState | undefined {
  const head = runGit(dir, ['rev-parse', 'HEAD']);
  if (head === undefined) return undefined;

  const status = runGit(dir, ['status', '--porcelain']);
  if (status === undefined) return undefined;

  return { commit: head.trim(), dirty: status.trim() !== '' };
}

// region | Helpers

/** Runs git in `dir`, returning its stdout, or `undefined` when it cannot start or exits non-zero. */
function runGit(dir: string, args: readonly string[]): string | undefined {
  const { error, status, stdout } = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });

  return error === undefined && status === 0 ? stdout : undefined;
}

// endregion | Helpers
