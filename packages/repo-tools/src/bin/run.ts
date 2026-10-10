import process from 'node:process';

import { runCli, type Writer } from '@williamthorsen/toolbelt.cli/candidate';

import { GIT_ADAPTERS, PROG, REPO_COMMANDS, type RepoContext } from '../commands/repo-commands.ts';

/** The context and writers with which `run` invokes the command tree. */
export interface RunOptions {
  context: RepoContext;
  stderr: Writer;
  stdout: Writer;
}

/**
 * Runs the thor-repo CLI for the given argv and resolves to the process exit code. An empty argv prints the help.
 *
 * Never calls `process.exit`: The bin entrypoint owns that, keeping this function testable.
 */
export async function run(argv: readonly string[], options: RunOptions = buildProcessOptions()): Promise<number> {
  return runCli(argv.length === 0 ? ['--help'] : argv, REPO_COMMANDS, { name: PROG, ...options });
}

// region | Helpers

/** Builds the options that bind the CLI to the current process and to git. */
function buildProcessOptions(): RunOptions {
  return {
    context: { adapters: GIT_ADAPTERS, cwd: process.cwd(), env: process.env },
    stderr: process.stderr,
    stdout: process.stdout,
  };
}

// endregion | Helpers
