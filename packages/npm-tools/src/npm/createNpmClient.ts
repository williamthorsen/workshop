import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

/**
 * Creates a client that runs the first `npm` on the `PATH` of `env`, in `cwd`. Every method reports a failure as an
 * outcome: Nothing throws.
 */
export function createNpmClient({ cwd, env }: NpmClientOptions): NpmClient {
  function runNpm(args: string[]): SpawnSyncReturns<string> {
    return spawnSync('npm', args, { cwd, encoding: 'utf8', env });
  }

  return {
    findVersion(name) {
      const { error, status, stderr, stdout } = runNpm(['view', name, 'version', '--json']);

      if (error !== undefined) return { kind: 'failed', detail: error.message };
      if (status === 0) return { kind: 'found' };
      if (readErrorCode(stdout) === 'E404') return { kind: 'absent' };

      return { kind: 'failed', detail: findErrorSummary(stderr) ?? `exit ${status}` };
    },

    publish(dir) {
      // A Ctrl+C at npm's prompt also reaches this process, whose default disposition would exit before the caller
      // cleans up; the listener lets npm alone handle the signal.
      process.on('SIGINT', ignoreInterrupt);
      let result: SpawnSyncReturns<Buffer>;
      try {
        result = spawnSync('npm', ['publish', dir, '--access', 'public'], { cwd, env, stdio: 'inherit' });
      } finally {
        process.removeListener('SIGINT', ignoreInterrupt);
      }
      const { error, signal, status } = result;

      if (error !== undefined) return { kind: 'failed', detail: error.message };
      if (status === 0) return { kind: 'published' };

      return { kind: 'failed', detail: signal === null ? `exit ${status}` : `signal ${signal}` };
    },

    whoami() {
      const { error, status, stderr, stdout } = runNpm(['whoami']);

      if (error !== undefined) {
        return isMissingCommand(error) ? { kind: 'missing' } : { kind: 'logged-out', detail: error.message };
      }
      if (status !== 0) return { kind: 'logged-out', detail: findErrorSummary(stderr) ?? `exit ${status}` };

      return { kind: 'logged-in', username: stdout.trim() };
    },
  };
}

/** The outcome of looking up a package name on the registry. */
export type FindVersionOutcome = { kind: 'absent' } | { kind: 'failed'; detail: string } | { kind: 'found' };

/** Runs the npm commands that a placeholder publish needs. */
export interface NpmClient {
  /** Reports whether the registry has any version of the package. */
  readonly findVersion: (name: string) => FindVersionOutcome;
  /** Publishes the package in a directory with public access, with npm attached to the terminal. */
  readonly publish: (dir: string) => PublishOutcome;
  /** Reports who npm is logged in as. */
  readonly whoami: () => WhoamiOutcome;
}

/** Where npm runs, and the environment whose `PATH` locates it. */
export interface NpmClientOptions {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

/** The outcome of a publish. */
export type PublishOutcome = { kind: 'failed'; detail: string } | { kind: 'published' };

/** The outcome of asking npm who is logged in. */
export type WhoamiOutcome =
  { kind: 'logged-in'; username: string } | { kind: 'logged-out'; detail: string } | { kind: 'missing' };

// region | Helpers

/**
 * Finds the line that summarizes an npm error on stderr, without its `npm error` prefix: the first `npm error` line
 * other than the bare, `code`, and `errno` ones, or else the last non-empty line.
 */
function findErrorSummary(stderr: string): string | undefined {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const summary = lines.find((line) => /^npm error\s+\S/.test(line) && !/^npm error (code|errno)\b/.test(line));

  return (summary ?? lines.at(-1))?.replace(/^npm error\s*/, '');
}

/** Does nothing on SIGINT, which keeps the process alive while the child that shares its terminal handles it. */
function ignoreInterrupt(): void {}

/** Reports whether a spawn failed because the command was not found. */
function isMissingCommand(error: Error): boolean {
  return 'code' in error && error.code === 'ENOENT';
}

/** Reports whether a value is a non-null object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Reads `error.code` from the JSON that `npm view --json` writes on failure, or undefined when it wrote none. */
function readErrorCode(stdout: string): unknown {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (!isRecord(parsed) || !isRecord(parsed['error'])) return undefined;

    return parsed['error']['code'];
  } catch {
    return undefined;
  }
}

// endregion | Helpers
