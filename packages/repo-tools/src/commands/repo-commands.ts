import fs from 'node:fs';
import path from 'node:path';

import { createCli, type Writer } from '@williamthorsen/toolbelt.cli/candidate';

import { listTrackedFiles, readCloneRoot, readCurrentBranch, readOriginUrl } from '../git/git-clone.ts';
import { expandTilde, formatDisplayPath, readHome } from '../portable/paths.ts';
import {
  appendEntry,
  assertWritable,
  parseRegistry,
  readRegistry,
  type RegistryEntry,
  saveRegistry,
  selectEntries,
  serializeRegistry,
  writeStack,
} from '../registry/registry.ts';
import { detectStack } from '../stacks/stack-detection.ts';
import { STACK_DETECTORS } from '../stacks/stack-detectors.ts';

/** The git and filesystem operations that the commands perform on a clone, injected so that unit tests supply their own. */
export interface CloneAdapters {
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
}

export const GIT_ADAPTERS: CloneAdapters = {
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
    'Prints the entry that registers the clone at <path>, deriving name and repo from its origin remote and stack from its tracked files.',
  operands: [{ name: 'path', description: 'A directory in the clone to register' }],
  flags: { file: FILE_FLAG, write: WRITE_FLAG },
  run: ({ context, flags, operands, stderr, stdout }) =>
    runAdd(buildVerbRun(context, flags.file, stdout, stderr), operands.path, flags.write),
});

const list = defineCommand({
  summary: 'Print one absolute path per selected repo',
  flags: {
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
    tag: {
      type: 'string',
      description: 'List only the repos whose tags contain this tag',
      valueHint: 'tag',
    },
  },
  run: ({ context, flags, stderr, stdout }) =>
    runList(buildVerbRun(context, flags.file, stdout, stderr), flags.json, flags.stack, flags.tag),
});

const scan = defineCommand({
  summary: 'Report each repo whose stack differs from what its tracked files signal, and rewrite it under --write',
  description:
    'Reports, per repo, the stack names that its tracked files signal and its entry lacks (+) and those that its entry declares and its files no longer signal (-).',
  flags: { file: FILE_FLAG, write: WRITE_FLAG },
  run: ({ context, flags, stderr, stdout }) => runScan(buildVerbRun(context, flags.file, stdout, stderr), flags.write),
});

/** The `thor-repo` command tree. */
export const REPO_COMMANDS = defineGroup({
  summary: 'List, scan, or register the repos on this machine, as recorded in ~/.config/repos.yaml',
  commands: { add, list, scan },
  epilog: `Stack names: ${STACK_NAMES.join(', ')}

--write refuses a registry whose resolved file is in a checkout on a branch named live. When ~/.config/repos.yaml links into a live worktree, pass --file naming the copy in a branch worktree.

Examples:
  ${PROG} list --tag live
  ${PROG} list --stack nmr --json
  ${PROG} scan --write --file path/to/branch-worktree/repos.yaml
  ${PROG} add ~/repos/example --write`,
});

// region | Helpers

/** The state shared by a command's run. */
interface VerbRun {
  adapters: CloneAdapters;
  cwd: string;
  file: string;
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
  const entry = { name: repo.slice(repo.indexOf('/') + 1), path: entryPath, repo, stack: detection };

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
function runList(run: VerbRun, isJson: boolean, stack: string | undefined, tag: string | undefined): number {
  const registry = readRegistry(run.file);
  if (typeof registry === 'string') return reportFailure(run, registry);
  const selected = selectEntries(registry.entries, { stack, tag });
  // The drift sweep reads a missing path as a repo without a clone here, so a pathless entry is refused instead.
  if (selected.some((entry) => entry.path === undefined)) {
    return reportFailure(run, `registry entry has no path: ${run.file}`);
  }

  if (isJson) {
    run.stdout(JSON.stringify({ repos: selected.map((entry): unknown => entry.node.toJSON()) }, null, 2));
    return 0;
  }
  for (const entry of selected) run.stdout(expandTilde(entry.path ?? '', run.home));
  return 0;
}

/** Runs `scan`: reports each entry whose stack differs from the detected one, and rewrites them under `--write`. */
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
  for (const entry of registry.entries) {
    const cloneDir = expandTilde(entry.path ?? '', run.home);
    const detected = scanClone(run, cloneDir, formatEntryName(entry));
    if (detected === undefined) {
      run.stderr(`${PROG}: ${formatEntryName(entry)}: no clone at ${cloneDir}; its stack is kept`);
      continue;
    }
    const additions = detected.filter((name) => !entry.stack.includes(name));
    const removals = entry.stack.toSorted().filter((name) => !detected.includes(name));
    if (additions.length + removals.length === 0) continue;
    const changes = [...additions.map((name) => `+${name}`), ...removals.map((name) => `-${name}`)];
    run.stdout(`${formatEntryName(entry)}: ${changes.join(' ')}`);
    writeStack(registry, entry, detected);
    isChanged = true;
  }

  if (isWrite && isChanged) saveRegistry(registry, run.file);
  return 0;
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
