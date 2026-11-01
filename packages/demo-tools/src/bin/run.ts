import path from 'node:path';

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

import { buildAidemoEnv, OPENAI_VARIABLES } from '../aidemo/build-aidemo-env.ts';
import { findEnvFileOverrides } from '../aidemo/find-env-file-overrides.ts';
import { resolveAidemo } from '../aidemo/resolve-aidemo.ts';
import { planTake, type TakeDisposition } from '../archive/plan-take.ts';
import type { SourceState } from '../clients/git/read-source-state.ts';
import { REPO_CONFIG_PATH } from '../config/find-repo-root.ts';
import { MACHINE_CONFIG_PATH } from '../config/read-machine-config.ts';
import { readRepoConfig, type RepoConfig } from '../config/read-repo-config.ts';
import { ARCHIVE_ROOT_VARIABLE, resolveArchiveRoot } from '../config/resolve-archive-root.ts';
import { resolveDemoDir } from '../demos/resolve-demo-dir.ts';
import type { RevoiceRequest } from '../voice/revoice-request.ts';
import type { VoiceRequest } from '../voice/voice-request.ts';
import { REVOICE } from './revoice-command.ts';
import { VOICE_GROUP } from './voice-commands.ts';

const EXIT_FAILURE = 1;

const { defineCommand, defineGroup } = createCli<CommandContext>();

const RENDER: Command<CommandContext> = defineCommand({
  summary: 'Render a demo with the configured aidemo environment',
  description: `Run aidemo render on one demo, from the root of the demo repository, with the environment that ${REPO_CONFIG_PATH} declares. When aidemo succeeds, copy the take to <archive root>/<archive.label>/<demo>/<take>/ with a provenance.json that records the commit and dirty state, the aidemo version, the voice, the options, the storyboard's checksum, and each file's checksum, unless the render is a --lang, --langs, or --variants render. ${ARCHIVE_ROOT_VARIABLE}, or archive.root in ~/${MACHINE_CONFIG_PATH}, sets the archive root.`,
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
  demo repository and sets demosDir, aidemo.env, and archive.label.
  ~/${MACHINE_CONFIG_PATH} sets archive.root, where render and revoice
  archive each take, which ${ARCHIVE_ROOT_VARIABLE} overrides, and the voice
  section, which the voice commands and revoice read.

Exit codes:
  0  Help or version printed, aidemo succeeded, or a voice command succeeded
  1  The configuration, the aidemo install, or the voice clone is unusable, a
     take cannot be archived, or a voice command failed
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

        const prepared = prepareLaunch(config, ['mcp'], context.effects, stderr, prefix);
        if (prepared === undefined) return EXIT_FAILURE;

        context.launch(prepared.launch);
        return;
      },
    }),
    probe: PROBE,
    render: RENDER,
    revoice: REVOICE,
    voice: VOICE_GROUP,
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
  let revoice: RevoiceRequest | undefined;
  let voice: VoiceRequest | undefined;
  const exitCode = await runCli(args.length === 0 ? ['--help'] : args, ROOT, {
    name: 'thor-demo',
    context: {
      effects,
      launch: (requested) => {
        launch = requested;
      },
      requestRevoice: (requested) => {
        revoice = requested;
      },
      requestVoice: (requested) => {
        voice = requested;
      },
    },
    version: () => resolveVersion(effects),
    stdout,
    stderr,
  });

  return { exitCode, launch, revoice, stderr: stderr.text, stdout: stdout.text, voice };
}

/** An aidemo process for the entry point to start once it has written the result's output. */
export interface Launch {
  readonly args: readonly string[];
  /** The aidemo bin, which the entry point runs with the node that runs `thor-demo`. */
  readonly bin: string;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  /** What `render` does with the take once aidemo exits 0. */
  readonly take?: TakeDisposition;
}

/** The effects deferred to the entry point, which keeps the runner free of I/O. */
export interface RunEffects {
  readonly arch: string;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly homeDir: string;
  readonly platform: string;
  readonly readSourceState: (dir: string) => SourceState | undefined;
  readonly resolveVersion: () => string;
}

/** What the caller should write to each stream, what to perform, and what to exit with when it performs nothing. */
export interface RunResult {
  readonly exitCode: number;
  readonly launch: Launch | undefined;
  /** A revoice to perform. */
  readonly revoice: RevoiceRequest | undefined;
  /** A voice command to perform. A command requests at most one of `launch`, `revoice`, and `voice`. */
  readonly voice: VoiceRequest | undefined;
  readonly stderr: string;
  readonly stdout: string;
}

/** What each command receives: the effects, and a way to request a launch, a revoice, or a voice command. */
export interface CommandContext {
  readonly effects: RunEffects;
  readonly launch: (launch: Launch) => void;
  readonly requestRevoice: (revoice: RevoiceRequest) => void;
  readonly requestVoice: (voice: VoiceRequest) => void;
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
 * Builds the launch of aidemo with `args` in the demo repository, with the installed aidemo's version, reporting an
 * unusable aidemo install to `stderr` and warning about a `.env` that would restore an OpenAI variable.
 */
function prepareLaunch(
  config: RepoConfig,
  args: readonly string[],
  effects: RunEffects,
  stderr: Writer,
  prefix: string,
): { aidemoVersion: string; launch: Launch } | undefined {
  const resolution = resolveAidemo(config.root);
  if (!resolution.ok) {
    stderr.write(`${prefix}: ${resolution.message}\n`);
    return undefined;
  }

  const overrides = findEnvFileOverrides(config.root, config.aidemoEnv, OPENAI_VARIABLES);
  if (overrides !== undefined) {
    stderr.write(
      `${prefix}: warning: ${overrides.envFilePath} sets ${overrides.names.join(', ')}, which aidemo loads over the environment that thor-demo passes; declare them in aidemo.env or remove them from the file to keep captions offline\n`,
    );
  }

  return {
    aidemoVersion: resolution.aidemo.version,
    launch: { args, bin: resolution.aidemo.bin, cwd: config.root, env: buildAidemoEnv(effects.env, config.aidemoEnv) },
  };
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

/**
 * Runs `render` or `probe`: Parses the demo and the options for aidemo, then requests the launch. `render` also reads
 * the archive root and attaches what to do with the take.
 */
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

  const archiveRoot = command === 'render' ? resolveArchiveRoot(context.effects) : undefined;
  if (archiveRoot?.ok === false) {
    stderr.write(`${prefix}: ${archiveRoot.message}\n`);
    return EXIT_FAILURE;
  }

  const params = [...options, ...forwardedArgs];
  const prepared = prepareLaunch(config, [command, demo.demoDir, ...params], context.effects, stderr, prefix);
  if (prepared === undefined) return EXIT_FAILURE;

  const { aidemoVersion, launch } = prepared;
  if (archiveRoot === undefined) {
    context.launch(launch);
    return;
  }

  const take = planTake({
    aidemoEnv: launch.env,
    aidemoVersion,
    archiveLabel: config.archiveLabel,
    archiveRoot: archiveRoot.archiveRoot,
    demoDir: demo.demoDir,
    demosRoot: path.join(root, demosDir),
    params,
    readSourceState: context.effects.readSourceState,
    renderedAt: new Date(),
    root,
  });
  context.launch({ ...launch, take });
  return;
}

// endregion | Helpers
