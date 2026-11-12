import { execFileSync } from 'node:child_process';

/** Runs git in a directory and returns its stdout, throwing when git fails. */
export function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Initializes a repository on `main` in a directory and commits its files. */
export function initWithCommit(dir: string): void {
  git(dir, 'init', '--quiet', '--initial-branch', 'main');
  git(dir, 'add', '.');
  git(dir, '-c', 'user.name=spec', '-c', 'user.email=spec@example.com', 'commit', '--quiet', '-m', 'init');
}
