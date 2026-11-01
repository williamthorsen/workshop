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

import { buildAidemoEnv } from '../aidemo/build-aidemo-env.ts';
import { findEnvFileOverrides } from '../aidemo/find-env-file-overrides.ts';
import { resolveAidemo } from '../aidemo/resolve-aidemo.ts';
import { planTake, type TakeDisposition } from '../archive/plan-take.ts';
import type { SourceState } from '../clients/git/read-source-state.ts';
import { REPO_CONFIG_PATH } from '../config/find-repo-root.ts';
import {
  DEFAULT_VOICE_HOME,
  DEFAULT_VOICE_MODEL,
  MACHINE_CONFIG_PATH,
  readMachineConfig,
} from '../config/read-machine-config.ts';
import { readRepoConfig, type RepoConfig } from '../config/read-repo-config.ts';
import { ARCHIVE_ROOT_VARIABLE, resolveArchiveRoot } from '../config/resolve-archive-root.ts';
import { resolveDemoDir } from '../demos/resolve-demo-dir.ts';
import { findOnPath } from '../portable/find-on-path.ts';
import { MLX_AUDIO_VERSION } from '../voice/mlx-audio/plan-install.ts';
import type { VoiceSetupRequest } from '../voice/perform-voice-setup.ts';

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
  ~/${MACHINE_CONFIG_PATH} sets archive.root, where render archives each take,
  which ${ARCHIVE_ROOT_VARIABLE} overrides, and the voice section, which voice
  setup reads.

Exit codes:
  0  Help or version printed, aidemo succeeded, or voice setup succeeded
  1  The configuration or the aidemo install is unusable, a rendered take
     cannot be archived, or a voice setup step failed
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
    voice: defineGroup({
      summary: "Manage the local voice clone that narrates demos in the presenter's voice",
      commands: {
        setup: defineCommand({
          summary: 'Install the voice-clone server and build the voice profile',
          description: `Install mlx-audio ${MLX_AUDIO_VERSION} into a virtual environment under voice.home, download voice.model there, build a voice profile from voice.reference, and verify the install by starting the server offline on 127.0.0.1 and synthesizing a phrase in the cloned voice to <voice.home>/verify.mp3, whose path it prints. A rerun skips each step whose inputs are unchanged. Requires Apple Silicon, uv, and ffmpeg.`,
          epilog: `Configuration (the voice section of ~/${MACHINE_CONFIG_PATH}):
  voice.reference.audio       Required. A recording of the voice to clone, in any
                              format that ffmpeg reads
  voice.reference.transcript  Required. A text file containing exactly what the
                              recording says
  voice.home                  Where to install. Default: ~/${DEFAULT_VOICE_HOME}
  voice.model                 Any mlx-audio model that clones from a reference
                              recording. Default: ${DEFAULT_VOICE_MODEL}

Paths expand ~ and \${VAR} and must be absolute.`,
          run: ({ context, stderr }) => runVoiceSetup(context, stderr),
        }),
      },
    }),
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
  let setup: VoiceSetupRequest | undefined;
  const exitCode = await runCli(args.length === 0 ? ['--help'] : args, ROOT, {
    name: 'thor-demo',
    context: {
      effects,
      launch: (requested) => {
        launch = requested;
      },
      requestSetup: (requested) => {
        setup = requested;
      },
    },
    version: () => resolveVersion(effects),
    stdout,
    stderr,
  });

  return { exitCode, launch, setup, stderr: stderr.text, stdout: stdout.text };
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

/** What the caller should write to each stream, launch or set up, and exit with when it does neither. */
export interface RunResult {
  readonly exitCode: number;
  readonly launch: Launch | undefined;
  /** A voice setup to perform. A command requests at most one of `launch` and `setup`. */
  readonly setup: VoiceSetupRequest | undefined;
  readonly stderr: string;
  readonly stdout: string;
}

/** What each command receives: the effects, and a way to request a launch or a voice setup. */
interface CommandContext {
  readonly effects: RunEffects;
  readonly launch: (launch: Launch) => void;
  readonly requestSetup: (setup: VoiceSetupRequest) => void;
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

  const overrides = findEnvFileOverrides(config.root, config.aidemoEnv);
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

/**
 * Runs `voice setup`: Checks the platform and the tools that setup needs, reads the voice section of the machine
 * configuration, then requests the setup.
 */
function runVoiceSetup(context: CommandContext, stderr: Writer): number | undefined {
  const prefix = 'thor-demo voice setup';
  const { arch, env, platform } = context.effects;
  function fail(problem: string): number {
    stderr.write(`${prefix}: ${problem}\n`);
    return EXIT_FAILURE;
  }

  if (platform !== 'darwin' || arch !== 'arm64') {
    return fail(`the voice clone runs on Apple Silicon (darwin on arm64) only, not ${platform} on ${arch}`);
  }
  for (const tool of ['uv', 'ffmpeg']) {
    if (findOnPath(tool, env['PATH']) === undefined)
      return fail(`${tool} is not on PATH; install it with brew install ${tool}`);
  }

  const config = readMachineConfig(context.effects);
  if (!config.ok) return fail(config.message);
  if (!config.voice.ok) return fail(config.voice.message);
  if (config.voice.voice === undefined) {
    return fail(
      `~/${MACHINE_CONFIG_PATH} does not set voice; add voice.reference.audio and voice.reference.transcript, and optionally voice.home and voice.model`,
    );
  }

  context.requestSetup({ voice: config.voice.voice });
  return;
}

// endregion | Helpers
