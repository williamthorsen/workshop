import { execFileSync } from 'node:child_process';

/** Commits the staged files of a repository under a fixed test identity. */
export function commitStaged(dir: string): void {
  git(
    dir,
    '-c',
    'user.name=spec',
    '-c',
    'user.email=spec@example.com',
    'commit',
    '--quiet',
    '--no-gpg-sign',
    '-m',
    'init',
  );
}

/** Runs git in a directory and returns its stdout, throwing when git fails. */
export function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Initializes a repository on `main` in a directory and commits its files. */
export function initWithCommit(dir: string): void {
  git(dir, 'init', '--quiet', '--initial-branch', 'main');
  git(dir, 'add', '.');
  commitStaged(dir);
}

/** Initializes a repository on git's default branch in a directory and stages its files without committing them. */
export function initWithIndex(dir: string): void {
  git(dir, 'init', '--quiet');
  git(dir, 'add', '.');
}
