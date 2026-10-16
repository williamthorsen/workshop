import fs from 'node:fs';
import path from 'node:path';

import { createCli, type Writer } from '@williamthorsen/toolbelt.cli/candidate';

import { listTrackedFiles, readCloneRoot, readCurrentBranch, readOriginUrl } from '../git/git-clone.ts';
import type { GitHubReader } from '../github/github-repo.ts';
import { expandTilde, formatDisplayPath, readHome } from '../portable/paths.ts';
import {
  appendEntry,
  assertWritable,
  type NewEntry,
  parseRegistry,
  readRegistry,
  type RegistryEntry,
  saveRegistry,
  selectEntries,
  serializeRegistry,
  writeGitHubFields,
  writeStack,
} from '../registry/registry.ts';
import { detectStack } from '../stacks/stack-detection.ts';
import { STACK_DETECTORS } from '../stacks/stack-detectors.ts';

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

/** The environment in which the commands run. */
export interface RepoContext {
  adapters: CloneAdapters;
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  github: GitHubReader;
}

export const GIT_ADAPTERS: CloneAdapters = {
  isDirectory: (dir) => fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() ?? false,
  listTrackedFiles,
  readCurrentBranch,
  readFile: (file) => fs.readFileSync(file, 'utf8'),
  readOriginUrl,
  readCloneRoot,
};

/** The name under which the CLI reports usage and messages. */
export const PROG = 'thor-repo';

const { defineCommand, defineGroup } = createCli<RepoContext>();

const STACK_NAMES = Object.keys(STACK_DETECTORS);

const CLONE_STATES = ['present', 'absent', 'all'] as const;

const VISIBILITIES = ['public', 'private'] as const;

const FILE_FLAG = {
  type: 'string',
  description: 'Registry to read (default: ~/.config/repos.yaml)',
  valueHint: 'path',
} as const;

const WRITE_FLAG = {
  type: 'boolean',
  description: 'Write the change to the registry; without it, nothing is written',
} as const;

const add = defineCommand({
  summary: 'Print the entry that registers a clone, and append it under --write',
  description:
    'Prints the entry that registers the clone at <path>, deriving name and repo from its origin remote, stack from its tracked files, and visibility and runner from GitHub through gh. When GitHub cannot be read, the entry omits visibility and runner.',
  operands: [{ name: 'path', description: 'A directory in the clone to register' }],
  flags: { file: FILE_FLAG, write: WRITE_FLAG },
  run: ({ context, flags, operands, stderr, stdout }) =>
    runAdd(buildVerbRun(context, flags.file, stdout, stderr), operands.path, flags.write),
});

const list = defineCommand({
  summary: 'Print one absolute path per selected repo',
  flags: {
    clone: {
      type: 'string',
      description: 'List the repos whose clone is present on this machine, absent from it, or all of them',
      valueHint: 'state',
      choices: CLONE_STATES,
      default: 'present',
    },
    file: FILE_FLAG,
    json: {
      type: 'boolean',
      description: 'Emit whole entries under a "repos" key, with paths as written, instead of paths',
    },
    stack: {
      type: 'string',
      description: `List only the repos whose stack contains this name, one of: ${STACK_NAMES.join(', ')}`,
      valueHint: 'name',
      choices: STACK_NAMES,
    },
    runner: {
      type: 'string',
      description: 'List only the repos whose CI runs on the runner with this label',
      valueHint: 'label',
    },
    tag: {
      type: 'string',
      description: 'List only the repos whose tags contain this tag',
      valueHint: 'tag',
    },
    visibility: {
      type: 'string',
      description: 'List only the repos with this visibility on GitHub',
      valueHint: 'visibility',
      choices: VISIBILITIES,
    },
  },
  run: ({ context, flags, stderr, stdout }) =>
    runList(buildVerbRun(context, flags.file, stdout, stderr), {
      clone: flags.clone,
      isJson: flags.json,
      runner: flags.runner,
      stack: flags.stack,
      tag: flags.tag,
      visibility: flags.visibility,
    }),
});

const scan = defineCommand({
  summary:
    'Report each repo whose stack, visibility, or runner differs from its tracked files and GitHub, and rewrite it under --write',
  description:
    "Reports, per repo, the stack names that its tracked files signal and its entry lacks (+) and those that its entry declares and its files no longer signal (-), then visibility=<value> and runner=<label> for values that differ from GitHub, and -runner when the repo's CI_RUNS_ON variable is unset. An entry whose clone is absent keeps its stack, and one whose GitHub read fails keeps its visibility and runner. Warns about a public repo whose runner is set.",
  flags: { file: FILE_FLAG, write: WRITE_FLAG },
  run: ({ context, flags, stderr, stdout }) => runScan(buildVerbRun(context, flags.file, stdout, stderr), flags.write),
});

/** The `thor-repo` command tree. */
export const REPO_COMMANDS = defineGroup({
  summary: 'List, scan, or register the repos on this machine, as recorded in ~/.config/repos.yaml',
  commands: { add, list, scan },
  epilog: `Stack names: ${STACK_NAMES.join(', ')}

scan and add read visibility and runner through gh. runner is the label that a repo's CI_RUNS_ON Actions variable selects: a bare label, or a JSON string.

--write refuses a registry whose resolved file is in a checkout on a branch named live. When ~/.config/repos.yaml links into a live worktree, pass --file naming the copy in a branch worktree.

Examples:
  ${PROG} list --tag live
  ${PROG} list --stack nmr --json
  ${PROG} list --clone absent
  ${PROG} list --visibility public --runner imac2
  ${PROG} scan --write --file path/to/branch-worktree/repos.yaml
  ${PROG} add ~/repos/example --write`,
});

// region | Helpers

/** The selection and output form of a `list` run. */
interface ListOptions {
  clone: (typeof CLONE_STATES)[number];
  isJson: boolean;
  runner: string | undefined;
  stack: string | undefined;
  tag: string | undefined;
  visibility: string | undefined;
}

/** The state shared by a command's run. */
interface VerbRun {
  adapters: CloneAdapters;
  cwd: string;
  file: string;
  github: GitHubReader;
  home: string;
  stderr: (line: string) => void;
  stdout: (line: string) => void;
}

/** Builds the state of a command's run, resolving the registry file to its default when `--file` is absent. */
function buildVerbRun(context: RepoContext, file: string | undefined, stdout: Writer, stderr: Writer): VerbRun {
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
function formatEntryName(entry: RegistryEntry): string {
  return entry.name ?? entry.path ?? '(unnamed)';
}

/** Returns the `owner/name` path of a remote URL in SSH, `ssh://`, or HTTPS form, or `undefined`. */
function parseRemotePath(url: string): string | undefined {
  const match = /[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url);
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  return `${match[1]}/${match[2]}`;
}

/** Reports a failure under the program's name and returns the failure status. */
function reportFailure(run: VerbRun, message: string): number {
  run.stderr(`${PROG}: ${message}`);
  return 1;
}

/** Runs `add`: prints the entry that registers a clone, and appends it under `--write`. */
function runAdd(run: VerbRun, target: string, isWrite: boolean): number {
  const registry = readRegistry(run.file);
  if (typeof registry === 'string') return reportFailure(run, registry);
  const cloneDir = run.adapters.readCloneRoot(path.resolve(run.cwd, expandTilde(target, run.home)));
  if (cloneDir === undefined) return reportFailure(run, `${target} is not in a git clone`);
  const origin = run.adapters.readOriginUrl(cloneDir);
  if (origin === undefined) return reportFailure(run, `${cloneDir} has no origin remote`);
  const repo = parseRemotePath(origin);
  if (repo === undefined) return reportFailure(run, `cannot read an owner and a name from the origin URL ${origin}`);

  const entryPath = formatDisplayPath(cloneDir, run.home);
  const existing = registry.entries.find(
    (entry) => entry.repo === repo || (entry.path !== undefined && expandTilde(entry.path, run.home) === cloneDir),
  );
  if (existing !== undefined)
    return reportFailure(run, `${cloneDir} is already registered as ${formatEntryName(existing)}`);

  const detection = scanClone(run, cloneDir);
  if (detection === undefined) return reportFailure(run, `cannot list the tracked files of ${cloneDir}`);
  const entry: NewEntry = { name: repo.slice(repo.indexOf('/') + 1), path: entryPath, repo, stack: detection };
  const facts = run.github(repo);
  if (typeof facts === 'string') {
    run.stderr(`${PROG}: ${repo}: cannot read GitHub: ${facts}; the entry omits visibility and runner`);
  } else {
    entry.visibility = facts.visibility;
    if (facts.runnerProblem === undefined) {
      entry.runner = facts.runner;
    } else {
      run.stderr(`${PROG}: ${repo}: CI_RUNS_ON ${facts.runnerProblem}; the entry omits runner`);
    }
  }

  const preview = parseRegistry('repos:\n');
  if (typeof preview !== 'string') {
    appendEntry(preview, entry);
    for (const line of serializeRegistry(preview)
      .replace(/^repos:\n/, '')
      .trimEnd()
      .split('\n'))
      run.stdout(line);
  }
  if (!isWrite) {
    run.stderr(`${PROG}: nothing written; pass --write to append the entry to ${run.file}`);
    return 0;
  }

  const refusal = assertWritable(run.file, run.adapters.readCurrentBranch);
  if (refusal !== undefined) return reportFailure(run, refusal);
  appendEntry(registry, entry);
  saveRegistry(registry, run.file);
  run.stderr(`${PROG}: appended ${entry.name} to ${run.file}`);
  return 0;
}

/** Runs `list`: prints the selected entries as absolute paths, or as JSON with each path as written. */
function runList(run: VerbRun, options: ListOptions): number {
  const registry = readRegistry(run.file);
  if (typeof registry === 'string') return reportFailure(run, registry);
  const matched = selectEntries(registry.entries, options);
  // The drift sweep reads a missing path as a repo without a clone here, so a pathless entry is refused instead.
  if (matched.some((entry) => entry.path === undefined)) {
    return reportFailure(run, `registry entry has no path: ${run.file}`);
  }
  const selected =
    options.clone === 'all'
      ? matched
      : matched.filter(
          (entry) =>
            run.adapters.isDirectory(expandTilde(entry.path ?? '', run.home)) === (options.clone === 'present'),
        );

  if (options.isJson) {
    run.stdout(JSON.stringify({ repos: selected.map((entry): unknown => entry.node.toJSON()) }, null, 2));
    return 0;
  }
  for (const entry of selected) run.stdout(expandTilde(entry.path ?? '', run.home));
  return 0;
}

/**
 * Runs `scan`: reports each entry whose stack, visibility, or runner differs from its clone and GitHub, and rewrites
 * them under `--write`.
 */
function runScan(run: VerbRun, isWrite: boolean): number {
  const registry = readRegistry(run.file);
  if (typeof registry === 'string') return reportFailure(run, registry);
  if (registry.entries.some((entry) => entry.path === undefined)) {
    return reportFailure(run, `registry entry has no path: ${run.file}`);
  }
  if (isWrite) {
    const refusal = assertWritable(run.file, run.adapters.readCurrentBranch);
    if (refusal !== undefined) return reportFailure(run, refusal);
  }

  let isChanged = false;
  const cloneless: string[] = [];
  for (const entry of registry.entries) {
    const label = formatEntryName(entry);
    const changes: string[] = [];
    const detected = scanClone(run, expandTilde(entry.path ?? '', run.home), label);
    if (detected === undefined) {
      cloneless.push(label);
    } else {
      changes.push(
        ...detected.filter((name) => !entry.stack.includes(name)).map((name) => `+${name}`),
        ...entry.stack
          .toSorted()
          .filter((name) => !detected.includes(name))
          .map((name) => `-${name}`),
      );
      writeStack(registry, entry, detected);
    }
    changes.push(...scanGitHub(run, entry, label));
    if (entry.visibility === 'public' && entry.runner !== undefined) {
      run.stderr(
        `${PROG}: ${label}: public repo routes CI to runner ${entry.runner}; a self-hosted runner must not run a fork's pull request`,
      );
    }
    if (changes.length === 0) continue;
    run.stdout(`${label}: ${changes.join(' ')}`);
    isChanged = true;
  }
  if (cloneless.length > 0) {
    run.stderr(`${PROG}: no clone on this machine, so the stack is kept, for: ${cloneless.join(', ')}`);
  }

  if (isWrite && isChanged) saveRegistry(registry, run.file);
  return 0;
}

/**
 * Reads an entry's visibility and runner from GitHub, writes the values that differ into the entry, and returns the
 * changes as `scan` reports them. A value that cannot be read is reported on stderr and kept.
 */
function scanGitHub(run: VerbRun, entry: RegistryEntry, label: string): string[] {
  if (entry.repo === undefined) {
    run.stderr(`${PROG}: ${label}: no repo; its visibility and runner are kept`);
    return [];
  }
  const facts = run.github(entry.repo);
  if (typeof facts === 'string') {
    run.stderr(`${PROG}: ${label}: cannot read GitHub: ${facts}; its visibility and runner are kept`);
    return [];
  }
  let runner = facts.runner;
  if (facts.runnerProblem !== undefined) {
    run.stderr(`${PROG}: ${label}: CI_RUNS_ON ${facts.runnerProblem}; its runner is kept`);
    runner = entry.runner;
  }
  const changes: string[] = [];
  if (facts.visibility !== entry.visibility) changes.push(`visibility=${facts.visibility}`);
  if (runner !== entry.runner) changes.push(runner === undefined ? '-runner' : `runner=${runner}`);
  if (changes.length > 0) writeGitHubFields(entry, { runner, visibility: facts.visibility });
  return changes;
}

/**
 * Returns the stack names that a clone's tracked files signal, reporting each unreadable manifest on stderr, or
 * `undefined` when the clone's tracked files cannot be listed.
 */
function scanClone(run: VerbRun, cloneDir: string, label: string = cloneDir): string[] | undefined {
  const trackedPaths = run.adapters.listTrackedFiles(cloneDir);
  if (trackedPaths === undefined) return undefined;
  const detection = detectStack(trackedPaths, (trackedPath) => run.adapters.readFile(path.join(cloneDir, trackedPath)));
  for (const problem of detection.problems) run.stderr(`${PROG}: ${label}: ${problem}`);
  return detection.stack;
}

// endregion | Helpers
