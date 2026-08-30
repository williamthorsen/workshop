import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Output ceiling for a git command reporting on every tracked path.
 *
 * Such a command returns several times the bytes of the listing it was given, so Node's 1 MiB default would truncate
 * a repository git itself handles, and truncation surfaces as a thrown `ENOBUFS` rather than as a short answer.
 */
const MAX_OUTPUT_BYTES = 64 * 1_024 * 1_024;

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
 * Runs a git command in the given directory with `input` on its stdin, and returns its stdout unaltered.
 *
 * Separate from `runGitRaw` because `promisify(execFile)` resolves to the captured output and exposes no handle on
 * the child, so nothing can write to it. Output is left untrimmed for the reason `runGitRaw` states.
 */
export async function runGitWithInput(path: string, input: string, ...args: string[]): Promise<string> {
  const resolved = expandHome(path);

  return new Promise((resolve, reject) => {
    const child = execFile('git', ['-C', resolved, ...args], { maxBuffer: MAX_OUTPUT_BYTES }, (error, stdout) => {
      if (error === null) {
        resolve(stdout);
      } else {
        // `ExecFileException` is declared through `Omit`, which drops the `Error` ancestry from the type while the
        // value stays one, so rejecting with git's own error reads to the rule as rejecting with a non-error.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        reject(error);
      }
    });

    if (child.stdin === null) {
      reject(new Error('git was spawned without a writable stdin'));
      return;
    }
    // git closes stdin when it fails before reading it, and the write then raises EPIPE as an unhandled stream error,
    // ending the process. Swallowing it leaves the callback above to reject with git's own failure instead.
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
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
