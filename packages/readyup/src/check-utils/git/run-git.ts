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

/**
 * Determine whether an error from a git command represents a missing ref.
 * Exit code 128 is ambiguous: git uses it for missing refs, invalid paths,
 * and "not a git repo". Inspect stderr to distinguish ref-missing from
 * infrastructure failures.
 */
export function isRefMissingError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if (!('code' in error)) return false;
  const { code } = error;
  if (code !== 128) return false;
  if (!('stderr' in error)) return false;
  const stderr = String(error.stderr);
  return (
    stderr.includes('unknown revision') ||
    stderr.includes('ambiguous argument') ||
    stderr.includes('not a valid object name') ||
    stderr.includes('Needed a single revision')
  );
}

/** Expand leading `~` or `~/` to the user's home directory. */
function expandTilde(path: string): string {
  if (path === '~' || path === '~/') return homedir();
  if (path.startsWith('~/')) return homedir() + path.slice(1);
  return path;
}
