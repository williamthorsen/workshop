import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Run a git command in the given directory and return trimmed stdout. */
export async function runGit(path: string, ...args: string[]): Promise<string> {
  const resolved = expandTilde(path);
  const { stdout } = await execFileAsync('git', ['-C', resolved, ...args]);
  return stdout.trim();
}

/** Expand leading `~` or `~/` to the user's home directory. */
function expandTilde(path: string): string {
  if (path === '~' || path === '~/') return homedir();
  if (path.startsWith('~/')) return homedir() + path.slice(1);
  return path;
}
