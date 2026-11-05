import { type Command, createCli, type PassthroughInput, renderHelp } from '@williamthorsen/toolbelt.cli/candidate';

import { REPO_CONFIG_PATH } from '../config/find-repo-root.ts';
import { prepareLaunch, readConfig } from './prepare-launch.ts';
import type { CommandContext } from './run.ts';

const EXIT_FAILURE = 1;

const { defineCommand } = createCli<CommandContext>();

export const LOGIN: Command<CommandContext> = defineCommand({
  summary: 'Sign in on the recording profile through aidemo login',
  description: `Run aidemo login from the root of the demo repository, with the environment that ${REPO_CONFIG_PATH} declares, so that the manual login lands on the recording profile that render and probe use.`,
  epilog: formatPassthroughCommandEpilog('login', 'thor-demo login --url https://app.example.com/'),
  passthrough: true,
  run: (input) => runPassthroughCommand('login', LOGIN, input),
});

export const PROFILE: Command<CommandContext> = defineCommand({
  summary: 'Show or reset the recording profile through aidemo profile',
  description: `Run aidemo profile from the root of the demo repository, with the environment that ${REPO_CONFIG_PATH} declares: path prints the recording profile that render and probe use, and reset wipes it.`,
  epilog: formatPassthroughCommandEpilog('profile', 'thor-demo profile reset'),
  passthrough: true,
  run: (input) => runPassthroughCommand('profile', PROFILE, input),
});

// region | Helpers

/** Describes the arguments of `login` and `profile`, which the help page of a passthrough command omits. */
function formatPassthroughCommandEpilog(command: string, example: string): string {
  return `Arguments:
  <args>    Arguments for aidemo ${command}

The arguments reach aidemo unchanged, except -h and --help, which print this
help unless they follow a literal --.

Example:
  ${example}`;
}

/** Runs `login` or `profile`: Requests the launch of the aidemo command with the arguments that follow it. */
function runPassthroughCommand(
  command: 'login' | 'profile',
  node: Command<CommandContext>,
  { args, context, stderr, stdout }: PassthroughInput<CommandContext>,
): number | undefined {
  const separatorIndex = args.indexOf('--');
  const ownArgs = separatorIndex === -1 ? args : args.slice(0, separatorIndex);
  if (ownArgs.some((arg) => arg === '--help' || arg === '-h')) {
    stdout.write(`${renderHelp(node, `thor-demo ${command}`)}\n`);
    return;
  }

  const prefix = `thor-demo ${command}`;
  const config = readConfig(context.effects, stderr, prefix);
  if (config === undefined) return EXIT_FAILURE;

  const forwardedArgs = separatorIndex === -1 ? [] : args.slice(separatorIndex + 1);
  const prepared = prepareLaunch(config, [command, ...ownArgs, ...forwardedArgs], context.effects, stderr, prefix);
  if (prepared === undefined) return EXIT_FAILURE;

  context.launch(prepared.launch);
  return;
}

// endregion | Helpers
