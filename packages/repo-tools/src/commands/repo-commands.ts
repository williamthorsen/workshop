import fs from 'node:fs';

import { createCli } from '@williamthorsen/toolbelt.cli/candidate';

import { listTrackedFiles, readCloneRoot, readCurrentBranch, readOriginUrl } from '../git/git-clone.ts';
import { expandTilde } from '../portable/paths.ts';
import { readRegistry, selectEntries } from '../registry/registry.ts';
import { STACK_DETECTORS } from '../stacks/stack-detectors.ts';
import { runAdd } from './runAdd.ts';
import { runScan } from './runScan.ts';
import { buildVerbRun, type CloneAdapters, PROG, type RepoContext, reportFailure, type VerbRun } from './verb-run.ts';

export const GIT_ADAPTERS: CloneAdapters = {
  isDirectory: (dir) => fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() ?? false,
  listTrackedFiles,
  readCurrentBranch,
  readFile: (file) => fs.readFileSync(file, 'utf8'),
  readOriginUrl,
  readCloneRoot,
};

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

// endregion | Helpers
