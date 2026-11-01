import { spawnSync } from 'node:child_process';

/** Runs git in `dir`, throwing when it exits non-zero, and returns its stdout. */
export function runGit(dir: string, ...args: string[]): string {
  const { status, stderr, stdout } = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (status !== 0) throw new Error(`git ${args.join(' ')} failed: ${stderr}`);

  return stdout;
}

/** Initializes a repository in `dir` and commits every file in it, returning the commit. */
export function commitAll(dir: string): string {
  runGit(dir, 'init', '--quiet');
  runGit(dir, 'add', '.');
  runGit(dir, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '--message', 'init');

  return runGit(dir, 'rev-parse', 'HEAD').trim();
}
