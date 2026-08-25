import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Returns a git command's stdout, trimmed, from a run in the given directory. */
export async function runGit(path: string, ...args: string[]): Promise<string> {
  return (await runGitRaw(path, ...args)).trim();
}

/**
 * Runs a git command in the given directory and returns its stdout unaltered.
 *
 * Trimming strips a leading space or tab from the first path of a listing, and the file it names then
 * reads as missing, so output containing paths needs this variant.
 */
export async function runGitRaw(path: string, ...args: string[]): Promise<string> {
  const resolved = expandHome(path);
  const { stdout } = await execFileAsync('git', ['-C', resolved, ...args]);
  return stdout;
}

/**
 * Reports whether an error from a git command means the ref was missing.
 *
 * Exit code 128 is ambiguous: git uses it for a missing ref, an invalid path, and "not a git repo"
 * alike, so stderr is what separates a missing ref from an infrastructure failure.
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

/** Returns `path` with a leading `~` or `~/` expanded to the user's home directory. */
export function expandHome(path: string): string {
  if (path === '~' || path === '~/') return homedir();
  if (path.startsWith('~/')) return homedir() + path.slice(1);
  return path;
}
