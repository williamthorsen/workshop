import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseTrustListing, stripTerminalControls, type TrustEntry } from './parseTrustListing.ts';
import { quoteShellArgs } from './quoteShellArgs.ts';

/** The outcome of adding a trusted publisher. */
export type AddTrustOutcome = { kind: 'added' } | { kind: 'failed'; detail: string };

/**
 * Returns the `npm` arguments that add a GitHub trusted publisher, answering npm's confirmation with `--yes`. A
 * permission missing from `TRUST_PERMISSION_FLAGS` is not passed.
 */
export function buildGithubTrustArgs(name: string, trust: GithubTrust): string[] {
  return [
    'trust',
    'github',
    name,
    '--repo',
    trust.repository,
    '--file',
    trust.file,
    ...(trust.environment === undefined ? [] : ['--env', trust.environment]),
    ...trust.permissions.map((permission) => TRUST_PERMISSION_FLAGS[permission]).filter((flag) => flag !== undefined),
    '--yes',
  ];
}

/**
 * Creates a client that runs the first `npm` on the `PATH` of `env`, in `cwd`. Every method reports a failure as an
 * outcome: Nothing throws.
 */
export function createNpmClient({ cwd, env, platform = process.platform }: NpmClientOptions): NpmClient {
  function runNpm(args: string[]): SpawnSyncReturns<string> {
    return spawnSync('npm', args, { cwd, encoding: 'utf8', env });
  }

  return {
    addGithubTrust(name, trust) {
      const outcome = toAttachedOutcome(spawnAttached('npm', buildGithubTrustArgs(name, trust), { cwd, env }));

      return outcome.kind === 'ok' ? { kind: 'added' } : outcome;
    },

    findVersion(name) {
      const { error, status, stderr, stdout } = runNpm(['view', name, 'version', '--json']);

      if (error !== undefined) return { kind: 'failed', detail: error.message };
      if (status === 0) return { kind: 'found' };
      if (readErrorCode(stdout) === 'E404') return { kind: 'absent' };

      return { kind: 'failed', detail: findErrorSummary(stderr) ?? `exit ${status}` };
    },

    listTrust(name) {
      const command = ['npm', 'trust', 'list', name, '--json'];
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thor-npm-listing-'));
      const transcriptPath = path.join(dir, 'transcript');
      try {
        const recordArgs = buildRecordArgs(platform, transcriptPath, command);
        if (recordArgs === undefined) {
          return { kind: 'failed', detail: 'recording npm output needs script(1), available on macOS and Linux' };
        }

        const probe = runNpm(['--version']);
        if (probe.error !== undefined) {
          return isMissingCommand(probe.error) ? { kind: 'missing' } : { kind: 'failed', detail: probe.error.message };
        }

        const result = spawnAttached('script', recordArgs, { cwd, env });
        if (result.error !== undefined) {
          const detail = isMissingCommand(result.error)
            ? 'script not found on PATH; recording npm output needs script(1)'
            : result.error.message;
          return { kind: 'failed', detail };
        }

        const transcript = fs.existsSync(transcriptPath) ? fs.readFileSync(transcriptPath, 'utf8') : '';
        if (result.status !== 0) {
          return {
            kind: 'failed',
            detail: findErrorSummary(stripTerminalControls(transcript)) ?? describeExit(result),
          };
        }

        return { kind: 'listed', ...parseTrustListing(transcript) };
      } finally {
        fs.rmSync(dir, { force: true, recursive: true });
      }
    },

    publish(dir) {
      const outcome = toAttachedOutcome(spawnAttached('npm', ['publish', dir, '--access', 'public'], { cwd, env }));

      return outcome.kind === 'ok' ? { kind: 'published' } : outcome;
    },

    revokeTrust(name, id) {
      const outcome = toAttachedOutcome(spawnAttached('npm', ['trust', 'revoke', name, '--id', id], { cwd, env }));

      return outcome.kind === 'ok' ? { kind: 'revoked' } : outcome;
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

/** A GitHub trusted publisher to add: the repository and workflow file that may publish, and what they may do. */
export interface GithubTrust {
  readonly environment?: string;
  readonly file: string;
  readonly permissions: readonly string[];
  readonly repository: string;
}

/** The outcome of listing a package's trusted publishers. */
export type ListTrustOutcome =
  | { kind: 'failed'; detail: string }
  | { kind: 'listed'; entries: readonly TrustEntry[]; otherCount: number }
  | { kind: 'missing' };

/** Runs the npm commands that the `thor-npm` commands need. */
export interface NpmClient {
  /** Adds a GitHub trusted publisher, with npm attached to the terminal. */
  readonly addGithubTrust: (name: string, trust: GithubTrust) => AddTrustOutcome;
  /** Reports whether the registry has any version of the package. */
  readonly findVersion: (name: string) => FindVersionOutcome;
  /**
   * Lists a package's trusted publishers, with npm attached to a pseudo-terminal that `script` records, so that npm
   * can still ask for approval. Reports `missing` when npm is not on PATH.
   */
  readonly listTrust: (name: string) => ListTrustOutcome;
  /** Publishes the package in a directory with public access, with npm attached to the terminal. */
  readonly publish: (dir: string) => PublishOutcome;
  /** Revokes a trusted publisher by its id, with npm attached to the terminal. */
  readonly revokeTrust: (name: string, id: string) => RevokeTrustOutcome;
  /** Reports who npm is logged in as. */
  readonly whoami: () => WhoamiOutcome;
}

/** Where npm runs, the environment whose `PATH` locates it, and the platform that selects the form of `script`. */
export interface NpmClientOptions {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
}

/** The outcome of a publish. */
export type PublishOutcome = { kind: 'failed'; detail: string } | { kind: 'published' };

/** The outcome of revoking a trusted publisher. */
export type RevokeTrustOutcome = { kind: 'failed'; detail: string } | { kind: 'revoked' };

/** The `npm trust github` flag that grants each permission that npm lists on a trust. */
export const TRUST_PERMISSION_FLAGS: Readonly<Record<string, string>> = {
  createPackage: '--allow-publish',
  createStagedPackage: '--allow-stage-publish',
};

/** The outcome of asking npm who is logged in. */
export type WhoamiOutcome =
  { kind: 'logged-in'; username: string } | { kind: 'logged-out'; detail: string } | { kind: 'missing' };

// region | Helpers

/**
 * Returns the `script` arguments that run a command and record its output to a file: the BSD form on macOS, the
 * util-linux form on Linux, and undefined elsewhere.
 */
function buildRecordArgs(platform: NodeJS.Platform, file: string, command: readonly string[]): string[] | undefined {
  if (platform === 'darwin') return ['-q', file, ...command];
  if (platform === 'linux') return ['--quiet', '--return', '--command', quoteShellArgs(command), file];

  return undefined;
}

/** Describes how a process ended without success: by its exit status, or by the signal that ended it. */
function describeExit({ signal, status }: { signal: NodeJS.Signals | null; status: number | null }): string {
  return signal === null ? `exit ${status}` : `signal ${signal}`;
}

/**
 * Finds the line that summarizes an npm error, without its `npm error` prefix: the first `npm error` line other than
 * the bare, `code`, and `errno` ones, or else the last non-empty line.
 */
function findErrorSummary(output: string): string | undefined {
  const lines = output
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

/**
 * Runs a command attached to the terminal. A Ctrl+C at the child's prompt also reaches this process, whose default
 * disposition would exit before the caller cleans up; the listener lets the child alone handle the signal.
 */
function spawnAttached(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
): SpawnSyncReturns<Buffer> {
  process.on('SIGINT', ignoreInterrupt);
  try {
    return spawnSync(command, args, { ...options, stdio: 'inherit' });
  } finally {
    process.removeListener('SIGINT', ignoreInterrupt);
  }
}

/** Reduces an attached run to success, or to a failure described by its error, exit status, or signal. */
function toAttachedOutcome(result: SpawnSyncReturns<Buffer>): { kind: 'failed'; detail: string } | { kind: 'ok' } {
  if (result.error !== undefined) return { kind: 'failed', detail: result.error.message };
  if (result.status === 0) return { kind: 'ok' };

  return { kind: 'failed', detail: describeExit(result) };
}

// endregion | Helpers
