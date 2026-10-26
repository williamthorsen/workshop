import path from 'node:path';

import type { SpawnDetached } from '../portable/spawn-detached.ts';
import { CommandError } from '../shared/errors.ts';
import type { CommandOutput, Environment } from '../shared/output.ts';
import { findOnPath } from '../shared/paths.ts';
import type { CommandResult, RunCommand } from '../shared/run-command.ts';

/** The JSON values that a report contains. */
export type JsonValue = boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };

/** How every report and every refusal is rendered. */
export type OutputFormat = 'json' | 'prose';

/**
 * How the profile name was arrived at: `named` on the command line or in the environment, `derived` from the working
 * directory's repository and branch, or `underived` when neither resolved and the name fell back to the default.
 */
export type ProfileOrigin = 'derived' | 'named' | 'underived';

/** The process state and the side effects that thor-chrome reaches through, which a unit test replaces. */
export interface ThorChromeDeps {
  env: Environment;
  isStdoutTerminal: boolean;
  /** Sends SIGTERM to a process, throwing when it cannot be signalled. */
  kill: (pid: number) => void;
  /** Returns the current time in epoch milliseconds. */
  now: () => number;
  run: RunCommand;
  sleep: (milliseconds: number) => Promise<void>;
  spawnDetached: SpawnDetached;
}

/** A profile's name and directory. */
export interface ProfileRef {
  dir: string;
  name: string;
}

/** The state of one thor-chrome invocation, which every verb reads and which a refusal reports from. */
export interface Invocation {
  deps: ThorChromeDeps;
  /** The rendered entries of a `quit` or `delete` report under `--json`. */
  entries: JsonValue[];
  format: OutputFormat;
  origin: ProfileOrigin;
  output: CommandOutput;
  profilesDir: string;
  /** Whether a profile was refused, which makes `quit` and `delete` exit 1 once every profile has been processed. */
  refused: boolean;
  /**
   * The profile being acted on, which a refusal reports beside its error. It is set once its name is known, so a
   * refusal raised before then reports no profile.
   */
  resolved: ProfileRef | undefined;
  /** The working directory's branch, repository name, and repository directory, from which the defaults derive. */
  work: WorkContext;
}

export interface WorkContext {
  branch: string | undefined;
  repo: string | undefined;
  repoDir: string | undefined;
}

export interface RefusalOptions {
  /** Fields folded into the error object under `--json`. */
  extra?: Record<string, string>;
  /** Follow-up lines printed beneath the prose headline. */
  hints?: string[];
  status?: number;
}

/** A refusal of the whole invocation, which carries a stable code that makes each recovery selectable. */
export class ThorChromeRefusal extends CommandError {
  readonly code: string;
  readonly extra: Record<string, string>;
  readonly hints: string[];
  readonly profile: ProfileRef | undefined;

  constructor(code: string, message: string, profile: ProfileRef | undefined, options: RefusalOptions = {}) {
    super(message, options.status ?? (code === USAGE_CODE ? USAGE_STATUS : 1));
    this.name = 'ThorChromeRefusal';
    this.code = code;
    this.extra = options.extra ?? {};
    this.hints = options.hints ?? [];
    this.profile = profile;
  }
}

/** The code of a refusal caused by the command line, which exits with the usage status. */
export const USAGE_CODE = 'usage';
const USAGE_STATUS = 2;

/** The recovery named by every process-list-unavailable refusal. */
export const PROCESS_LIST_RECOVERY_HINT = 'Run this command from a terminal outside the sandbox.';

/** Builds the invocation state for a run, with nothing resolved yet. */
export function createInvocation(output: CommandOutput, format: OutputFormat, deps: ThorChromeDeps): Invocation {
  return {
    deps,
    entries: [],
    format,
    origin: 'named',
    output,
    profilesDir: resolveProfilesDir(deps.env),
    refused: false,
    resolved: undefined,
    work: { branch: undefined, repo: undefined, repoDir: undefined },
  };
}

/** Returns a refusal that reports the invocation's resolved profile, if any, beside its error. */
export function refuse(
  invocation: Invocation,
  code: string,
  message: string,
  options?: RefusalOptions,
): ThorChromeRefusal {
  return new ThorChromeRefusal(code, message, invocation.resolved, options);
}

/** Refuses when an external command on which thor-chrome depends is not on PATH. */
export function requireCommand(invocation: Invocation, command: string): void {
  if (findOnPath(command, invocation.deps.env['PATH'] ?? '') !== undefined) return;
  throw refuse(invocation, 'missing-command', `required command '${command}' not found`, { status: 127 });
}

/**
 * Runs a tool whose absence the caller treats as a failed run rather than as a refusal: a missing program reports
 * status 127 and empty output, as the shell does.
 */
export function runTolerantly(invocation: Invocation, program: string, args: readonly string[]): CommandResult {
  try {
    return invocation.deps.run(program, args);
  } catch (error) {
    if (error instanceof CommandError && error.exitCode === 127) return { status: 127, stderr: '', stdout: '' };
    throw error;
  }
}

// region | Helpers

/**
 * Returns the directory that holds the profiles: `thor-chrome/profiles` under `XDG_DATA_HOME` when that is absolute, as
 * the XDG Base Directory specification requires, else under `~/.local/share`.
 */
function resolveProfilesDir(env: Environment): string {
  const dataHome = env['XDG_DATA_HOME'] ?? '';
  const base = path.isAbsolute(dataHome) ? dataHome : `${env['HOME'] ?? ''}/.local/share`;
  return `${base}/thor-chrome/profiles`;
}

// endregion | Helpers
