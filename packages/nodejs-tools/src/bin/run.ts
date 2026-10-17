import { createCli, runCli, UsageError, type Writer } from '@williamthorsen/toolbelt.cli/candidate';
import { describeError } from '@williamthorsen/toolbelt.errors';

import { runAsdfShims } from './runAsdfShims.ts';
import { runPnpm } from './runPnpm.ts';
import { DEFAULT_PROTECT_LIST, DEFAULT_ROOT, parseActiveDays, runPruneModules } from './runPruneModules.ts';
import { PNPM, resolveVersion, type ThorNodeEffects, type ThorNodeResult } from './thor-node-result.ts';

const { defineCommand, defineGroup } = createCli<ThorNodeEffects>();

const EXIT_CODES = `Exit codes:
  0  A check found nothing to fix, or prune-modules completed
  1  A check found something to fix, or prune-modules failed to delete a directory or was declined
  2  Usage or validation error
  3  The command does not apply; the reason is on stderr`;

const ASDF_SHIMS_DESCRIPTION = `Report every asdf shim that names the nodejs plugin but not the active version. Such a shim stays on PATH and
fails when invoked. Each is classified as an orphan, which shadows another executable of that name on PATH, or
as having no other provider, and the commands that provide or remove it are printed. A shim that an installed
version of another asdf plugin also provides is not reported, since asdf may resolve the command there.`;

const ASDF_SHIMS_EPILOG = `The active version is the one running this command, read from its install path, so the check spawns nothing
and needs no repository. It exits 1 when a shim is stranded, 0 when none is, and 3 when node is not an asdf
install.

The printed remedies use \`asdf reshim nodejs\`, which regenerates every shim from the installed versions,
rather than \`asdf reshim nodejs <version>\`, which merges into an existing shim and keeps stale lines.`;

const PNPM_DESCRIPTION = `Check the pnpm that runs in the working directory against the packageManager pin of the nearest package.json
declaring one, from the working directory upward, and name what provides the pnpm on PATH: the asdf pnpm plugin,
corepack or an npm-global pnpm under a nodejs version, an asdf shim stranded under the running node, or otherwise
its path.`;

const PNPM_EPILOG = `The version that runs is read by running \`pnpm --version\` in the pinned directory, the one process that this
command spawns: pnpm 10 and later switch themselves to the pinned version whatever provides them, and corepack
selects it, so a version read from the filesystem would report the installed pnpm and a mismatch that does not
exist. That run may download the pinned version on first use.

It prints repair commands only when the versions differ, and they install the pin through whatever provides
pnpm now.

It exits 1 when the versions differ, when pnpm reported no version, or when pnpm is not on PATH; 0 when they
match; and 3, with the reason on stderr, when no pin is in reach or the pin names another package manager.`;

const PRUNE_MODULES_DESCRIPTION = `Find every node_modules directory under a root and report, or with --apply delete, each one that the
protect-list does not match and that is not recently active. The scan follows no symlinks and does not search
inside a node_modules directory, and nothing outside the matched node_modules trees is touched. Without --apply,
nothing is deleted.`;

const PRUNE_MODULES_EPILOG = `Protect-list: ~/${DEFAULT_PROTECT_LIST} unless --protect-list names another file. A missing
default file protects nothing; a missing named file is an error. One glob per line (*, **, ?), absolute or
starting with ~, with # comments. A pattern protects every node_modules whose parent directory it matches or lies
beneath a directory that it matches:

  ~/repos/atlassian/mcp-*
  ~/repos/*/*.live

Active guard: a node_modules is kept when the git index of its enclosing work tree, or outside a work tree its
parent directory, was modified within the last --active-days days (30 by default). A linked worktree is judged by
its own index.

Sizes are allocated disk space, as du reports it. A pnpm project shares files with the pnpm store, so deleting its
node_modules frees less until \`pnpm store prune\` runs.

It exits 0 when it completes; 1 when a deletion fails or the confirmation is declined; and 3, with the reason on
stderr, when the root is not an existing directory.`;

const ROOT = defineGroup({
  summary:
    'Utilities for inspecting the Node.js runtime and the commands that it installs, and for pruning node_modules directories.',
  epilog: EXIT_CODES,
  commands: {
    'asdf-shims': defineCommand({
      summary: 'Report asdf node shims that the active nodejs version does not provide',
      description: ASDF_SHIMS_DESCRIPTION,
      epilog: ASDF_SHIMS_EPILOG,
      run: ({ context, stderr, stdout }) => reportFailures(() => writeResult(runAsdfShims(context), stdout, stderr)),
    }),
    [PNPM]: defineCommand({
      summary: 'Check the pnpm that runs here against the nearest packageManager pin',
      description: PNPM_DESCRIPTION,
      epilog: PNPM_EPILOG,
      run: ({ context, stderr, stdout }) => reportFailures(() => writeResult(runPnpm(context), stdout, stderr)),
    }),
    'prune-modules': defineCommand({
      summary: 'Delete the node_modules directories that the protect-list and the active guard do not keep',
      description: PRUNE_MODULES_DESCRIPTION,
      epilog: PRUNE_MODULES_EPILOG,
      flags: {
        activeDays: {
          type: 'string',
          description: 'Keep a directory whose project was active within this many days (default 30)',
          valueHint: 'n',
          parse: parseActiveDays,
        },
        apply: { type: 'boolean', description: 'Delete the directories, after confirmation' },
        noActiveGuard: { type: 'boolean', description: 'Do not keep recently active directories' },
        noConfirm: { type: 'boolean', description: 'Delete without asking for confirmation' },
        protectList: {
          type: 'path',
          description: `The protect-list file (default ~/${DEFAULT_PROTECT_LIST})`,
          valueHint: 'path',
        },
        root: { type: 'path', description: `The directory to scan (default ~/${DEFAULT_ROOT})`, valueHint: 'path' },
      },
      run: ({ context, flags, stderr, stdout }) =>
        reportFailures(() => runPruneModules(flags, context, { stderr, stdout })),
    }),
  },
});

/**
 * Runs the `thor-node` command line, writing to the given writers and resolving to the exit code rather than exiting,
 * so that the whole surface is exercisable without a process. Every failure is reported through the writers and the
 * exit code: Nothing throws.
 *
 * @internal
 */
export async function run(args: string[], effects: ThorNodeEffects, streams: ThorNodeStreams): Promise<number> {
  return runCli(args, ROOT, {
    name: 'thor-node',
    baseDir: effects.cwd,
    context: effects,
    version: () => resolveVersion(effects),
    stdout: streams.stdout,
    stderr: streams.stderr,
  });
}

/** The writers that receive the command's output. */
export interface ThorNodeStreams {
  readonly stderr: Writer;
  readonly stdout: Writer;
}

// region | Helpers

/** Runs a command's body, reporting anything that it throws as a usage error, which exits 2 with a pointer to help. */
async function reportFailures(body: () => number | Promise<number>): Promise<number> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof UsageError) throw error;

    throw new UsageError(describeError(error), { cause: error });
  }
}

/** Writes a check's result to the streams and returns its exit code. */
function writeResult(result: ThorNodeResult, stdout: Writer, stderr: Writer): number {
  if (result.stdout !== '') stdout.write(result.stdout);
  if (result.stderr !== '') stderr.write(result.stderr);

  return result.exitCode;
}

// endregion | Helpers
