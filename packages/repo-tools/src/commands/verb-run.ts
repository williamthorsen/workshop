import type { Writer } from '@williamthorsen/toolbelt.cli/candidate';

import type { GitHubReader } from '../github/github-repo.ts';
import { readHome } from '../portable/paths.ts';
import type { RegistryEntry } from '../registry/registry.ts';

/** The name under which the CLI reports usage and messages. */
export const PROG = 'thor-repo';

/** Builds the state of a command's run, resolving the registry file to its default when `--file` is absent. */
export function buildVerbRun(context: RepoContext, file: string | undefined, stdout: Writer, stderr: Writer): VerbRun {
  const home = readHome(context.env);
  return {
    adapters: context.adapters,
    cwd: context.cwd,
    file: file ?? `${home}/.config/repos.yaml`,
    github: context.github,
    home,
    stderr: (line) => stderr.write(`${line}\n`),
    stdout: (line) => stdout.write(`${line}\n`),
  };
}

/** Returns the name under which an entry is reported: its name, else its path. */
export function formatEntryName(entry: RegistryEntry): string {
  return entry.name ?? entry.path ?? '(unnamed)';
}

/**
 * Returns the host and the `owner/name` path of a remote URL in scp-like SSH, `ssh://`, or HTTP(S) form, or
 * `undefined`. The host is lowercased and excludes any user and port; the path is the URL's last two segments.
 */
export function parseRemoteUrl(url: string): RemoteUrl | undefined {
  const match =
    /^(?:[a-z][a-z\d+.-]*:\/\/)?(?:[^@/]+@)?([^:/]+)(?::\d+)?[:/](?:.*\/)?([^/:]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(url);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) return undefined;
  return { host: match[1].toLowerCase(), path: `${match[2]}/${match[3]}` };
}

/** Reports a failure under the program's name and returns the failure status. */
export function reportFailure(run: VerbRun, message: string): number {
  run.stderr(`${PROG}: ${message}`);
  return 1;
}

/**
 * The git and filesystem operations that the commands perform on a clone, injected so that unit tests supply their
 * own.
 */
export interface CloneAdapters {
  isDirectory: (dir: string) => boolean;
  listTrackedFiles: (cloneDir: string) => string[] | undefined;
  readCurrentBranch: (dir: string) => string | undefined;
  readFile: (file: string) => string;
  readOriginUrl: (cloneDir: string) => string | undefined;
  readCloneRoot: (dir: string) => string | undefined;
}

/** The parts of a remote URL that `add` reads. */
export interface RemoteUrl {
  host: string;
  path: string;
}

/** The environment in which the commands run. */
export interface RepoContext {
  adapters: CloneAdapters;
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  github: GitHubReader;
}

/** The state shared by a command's run. */
export interface VerbRun {
  adapters: CloneAdapters;
  cwd: string;
  file: string;
  github: GitHubReader;
  home: string;
  stderr: (line: string) => void;
  stdout: (line: string) => void;
}
