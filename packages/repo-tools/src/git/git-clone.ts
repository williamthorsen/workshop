import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import path from 'node:path';

/** The parts of a git run that decide whether it failed and why. */
export type GitRun = Pick<SpawnSyncReturns<string>, 'error' | 'signal' | 'status' | 'stderr'>;

/**
 * Returns the reason that a git run failed, or `undefined` when it succeeded. A run that git did not complete, such
 * as one whose output overflowed the buffer, is described by its error before its signal, because such a run reports
 * both.
 */
export function describeGitFailure(args: readonly string[], run: GitRun): string | undefined {
  const subcommand = args[0] ?? '';
  if (run.error !== undefined) return `cannot run git ${subcommand}: ${run.error.message}`;
  if (run.signal !== null) return `git ${subcommand} was killed by ${run.signal}`;
  if (run.status === 0) return undefined;
  return run.stderr.trim().split('\n', 1)[0] || `git ${subcommand} exited ${run.status ?? 'without a status'}`;
}

/** Lists the paths that git tracks in a clone, relative to its root, or returns the reason that git cannot. */
export function listTrackedFiles(cloneDir: string): string[] | string {
  const outcome = runGitForOutcome(cloneDir, ['ls-files', '-z']);
  if ('failure' in outcome) return outcome.failure;
  return outcome.stdout.split('\0').filter((trackedPath) => trackedPath !== '');
}

/**
 * Lists the linked worktrees of a clone, excluding its main worktree, or returns the reason that git cannot. A
 * worktree whose directory git reports as missing is marked prunable.
 */
export function listWorktrees(primary: string): LinkedWorktree[] | string {
  const outcome = runGitForOutcome(primary, ['worktree', 'list', '--porcelain', '-z']);
  if ('failure' in outcome) return outcome.failure;
  // Each record is a run of NUL-terminated `key value` lines, and an empty line ends it.
  const records = outcome.stdout.split('\0\0').filter((record) => record !== '');
  return records.slice(1).flatMap((record): LinkedWorktree[] => {
    const lines = record.split('\0');
    const worktreePath = lines.find((line) => line.startsWith('worktree '))?.slice('worktree '.length);
    if (worktreePath === undefined) return [];
    return [{ isPrunable: lines.some((line) => line.startsWith('prunable')), path: worktreePath }];
  });
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

/**
 * Restores the links between a clone's main worktree and its linked worktrees at the given paths, in both directions,
 * after any of them moved. Returns the reason that git failed, or `undefined`.
 */
export function repairWorktrees(primary: string, worktreePaths: readonly string[]): string | undefined {
  const outcome = runGitForOutcome(primary, ['worktree', 'repair', ...worktreePaths]);
  return 'failure' in outcome ? outcome.failure : undefined;
}

/** A linked worktree of a clone, as `git worktree list` reports it. */
export interface LinkedWorktree {
  isPrunable: boolean;
  path: string;
}

// region | Helpers

/** Runs git in a directory and returns its stdout, or `undefined` when it fails. */
function runGit(dir: string, args: readonly string[]): string | undefined {
  const outcome = runGitForOutcome(dir, args);
  return 'stdout' in outcome ? outcome.stdout : undefined;
}

/** Runs git in a directory, without a cap on its output, and returns its stdout or the reason that it failed. */
function runGitForOutcome(dir: string, args: readonly string[]): { stdout: string } | { failure: string } {
  const result = spawnSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    maxBuffer: Infinity,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const failure = describeGitFailure(args, result);
  return failure === undefined ? { stdout: result.stdout } : { failure };
}

// endregion | Helpers
