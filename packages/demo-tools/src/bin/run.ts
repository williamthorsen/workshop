import {
  type Command,
  createCli,
  type PassthroughInput,
  renderHelp,
  runCli,
  UsageError,
  type Writer,
} from '@williamthorsen/toolbelt.cli/candidate';
import { describeError } from '@williamthorsen/toolbelt.errors';

import { buildAidemoEnv } from '../aidemo/build-aidemo-env.ts';
import { findEnvFileOverrides } from '../aidemo/find-env-file-overrides.ts';
import { resolveAidemo } from '../aidemo/resolve-aidemo.ts';
import { REPO_CONFIG_PATH } from '../config/find-repo-root.ts';
import { readRepoConfig, type RepoConfig } from '../config/read-repo-config.ts';
import { resolveDemoDir } from '../demos/resolve-demo-dir.ts';

const EXIT_FAILURE = 1;

const { defineCommand, defineGroup } = createCli<CommandContext>();

const RENDER: Command<CommandContext> = defineCommand({
  summary: 'Render a demo with the configured aidemo environment',
  description: `Run aidemo render on one demo, from the root of the demo repository, with the environment that ${REPO_CONFIG_PATH} declares.`,
  epilog: formatDemoCommandEpilog('render', 'thor-demo render quickstart --tts local'),
  passthrough: true,
  run: (input) => runDemoCommand('render', RENDER, input),
});

const PROBE: Command<CommandContext> = defineCommand({
  summary: 'Probe a demo with the configured aidemo environment',
  description: `Run aidemo probe on one demo, from the root of the demo repository, with the environment that ${REPO_CONFIG_PATH} declares.`,
  epilog: formatDemoCommandEpilog('probe', 'thor-demo probe quickstart --golden'),
  passthrough: true,
  run: (input) => runDemoCommand('probe', PROBE, input),
});

const ROOT = defineGroup({
  summary: 'Run aidemo demos with the environment that the demo repository configures.',
  epilog: `Configuration:
  ${REPO_CONFIG_PATH}, found in the working directory or a parent, marks the root of the
  demo repository and sets demosDir and aidemo.env.

Exit codes:
  0  Help or version printed, or aidemo succeeded
  1  The configuration or the aidemo install is unusable
  2  Usage or validation error
  Otherwise, the exit code of aidemo`,
  commands: {
    mcp: defineCommand({
      summary: "Run aidemo's MCP server with the configured aidemo environment",
      description: `Run aidemo mcp from the root of the demo repository, with the environment that ${REPO_CONFIG_PATH} declares and stdio inherited. A demo repository's .mcp.json launches it as {"command": "thor-demo", "args": ["mcp"]}.`,
      run: ({ context, stderr }) => {
        const prefix = 'thor-demo mcp';
        const config = readConfig(context.effects, stderr, prefix);
        if (config === undefined) return EXIT_FAILURE;

        const launch = prepareLaunch(config, ['mcp'], context.effects, stderr, prefix);
        if (launch === undefined) return EXIT_FAILURE;

        context.launch(launch);
        return;
      },
    }),
    probe: PROBE,
    render: RENDER,
  },
});

/**
 * Runs the `thor-demo` command line, returning what to write, what to launch, and what to exit with rather than
 * doing any of it, so that the whole surface is exercisable without a process. An empty argv prints the help. Every
 * failure is reported through the result: Nothing throws.
 */
export async function run(args: readonly string[], effects: RunEffects): Promise<RunResult> {
  const stdout = createTextBuffer();
  const stderr = createTextBuffer();
  let launch: Launch | undefined;
  const exitCode = await runCli(args.length === 0 ? ['--help'] : args, ROOT, {
    name: 'thor-demo',
    context: {
      effects,
      launch: (requested) => {
        launch = requested;
      },
    },
    version: () => resolveVersion(effects),
    stdout,
    stderr,
  });

  return { exitCode, launch, stderr: stderr.text, stdout: stdout.text };
}

/** An aidemo process for the entry point to start once it has written the result's output. */
export interface Launch {
  readonly args: readonly string[];
  /** The aidemo bin, which the entry point runs with the node that runs `thor-demo`. */
  readonly bin: string;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

/** The effects deferred to the entry point, which keeps the runner free of I/O. */
export interface RunEffects {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly homeDir: string;
  readonly resolveVersion: () => string;
}

/** What the caller should write to each stream, launch, and exit with when it launches nothing. */
export interface RunResult {
  readonly exitCode: number;
  readonly launch: Launch | undefined;
  readonly stderr: string;
  readonly stdout: string;
}

/** What each command receives: the effects, and a way to request a launch. */
interface CommandContext {
  readonly effects: RunEffects;
  readonly launch: (launch: Launch) => void;
}

// region | Helpers

/** Returns a writer that accumulates what is written to it. */
function createTextBuffer(): Writer & { readonly text: string } {
  let text = '';

  return {
    get text() {
      return text;
    },
    write(chunk: string) {
      text += chunk;
    },
  };
}

/** Describes the arguments of `render` and `probe`, which the help page of a passthrough command omits. */
function formatDemoCommandEpilog(command: string, example: string): string {
  return `Arguments:
  <demo>    The demo's name, or its path under demosDir
  <args>    Options for aidemo ${command}

The options after the demo reach aidemo unchanged, except -h and --help, which
print this help unless they follow a literal --.

Example:
  ${example}`;
}

/**
 * Builds the launch of aidemo with `args` in the demo repository, reporting an unusable aidemo install to `stderr`
 * and warning about a `.env` that would restore an OpenAI variable.
 */
function prepareLaunch(
  config: RepoConfig,
  args: readonly string[],
  effects: RunEffects,
  stderr: Writer,
  prefix: string,
): Launch | undefined {
  const resolution = resolveAidemo(config.root);
  if (!resolution.ok) {
    stderr.write(`${prefix}: ${resolution.message}\n`);
    return undefined;
  }

  const overrides = findEnvFileOverrides(config.root, config.aidemoEnv);
  if (overrides !== undefined) {
    stderr.write(
      `${prefix}: warning: ${overrides.envFilePath} sets ${overrides.names.join(', ')}, which aidemo loads over the environment that thor-demo passes; declare them in aidemo.env or remove them from the file to keep captions offline\n`,
    );
  }

  return { args, bin: resolution.aidemo.bin, cwd: config.root, env: buildAidemoEnv(effects.env, config.aidemoEnv) };
}

/** Reads the repository configuration, reporting a failure to `stderr`. */
function readConfig(effects: RunEffects, stderr: Writer, prefix: string): RepoConfig | undefined {
  const result = readRepoConfig(effects);
  if (result.ok) return result.config;

  stderr.write(`${prefix}: ${result.message}\n`);
  return undefined;
}

/** Resolves the installed version, reporting a failure as a usage error, which exits 2. */
function resolveVersion(effects: RunEffects): string {
  try {
    return effects.resolveVersion();
  } catch (error) {
    throw new UsageError(describeError(error), { cause: error });
  }
}

/** Runs `render` or `probe`: Parses the demo and the options for aidemo, then requests the launch. */
function runDemoCommand(
  command: 'probe' | 'render',
  node: Command<CommandContext>,
  { args, context, stderr, stdout }: PassthroughInput<CommandContext>,
): number | undefined {
  const separatorIndex = args.indexOf('--');
  const ownArgs = separatorIndex === -1 ? args : args.slice(0, separatorIndex);
  if (ownArgs.some((arg) => arg === '--help' || arg === '-h')) {
    stdout.write(`${renderHelp(node, `thor-demo ${command}`)}\n`);
    return;
  }

  const forwardedArgs = separatorIndex === -1 ? [] : args.slice(separatorIndex + 1);

  const [demoArgument, ...options] = ownArgs;
  if (demoArgument === undefined || demoArgument.startsWith('-')) {
    throw new UsageError('expects a demo name before any option');
  }

  const prefix = `thor-demo ${command}`;
  const config = readConfig(context.effects, stderr, prefix);
  if (config === undefined) return EXIT_FAILURE;

  const { demosDir, root } = config;
  const demo = resolveDemoDir(root, demosDir, demoArgument);
  if (!demo.found) {
    const names = demo.demoNames.length === 0 ? '(none)' : demo.demoNames.join(', ');
    throw new UsageError(`unknown demo "${demoArgument}"; the demos in ${demosDir} are: ${names}`);
  }

  const launch = prepareLaunch(
    config,
    [command, demo.demoDir, ...options, ...forwardedArgs],
    context.effects,
    stderr,
    prefix,
  );
  if (launch === undefined) return EXIT_FAILURE;

  context.launch(launch);
  return;
}

// endregion | Helpers
