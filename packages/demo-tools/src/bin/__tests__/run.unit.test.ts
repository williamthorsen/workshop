import { chmodSync, rmSync } from 'node:fs';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { DEFAULT_VOICE_MODEL } from '../../config/read-machine-config.ts';
import { run, type RunEffects } from '../run.ts';

const VERSION = '9.9.9';

const HOME = '/home/demo';

const EFFECTS: RunEffects = {
  arch: 'arm64',
  cwd: '/',
  env: {},
  homeDir: HOME,
  platform: 'darwin',
  readSourceState: () => undefined,
  resolveVersion: () => VERSION,
};

const AIDEMO_MANIFEST = 'node_modules/@tandryukha/aidemo/package.json';

const VOICE_SECTION = 'voice:\n  reference:\n    audio: ~/reference.m4a\n    transcript: ~/reference.txt\n';

describe(run, () => {
  describe('help and version', () => {
    it.each([['--help'], ['-h']])('prints the root help on %o', async (flag) => {
      const { exitCode, stderr, stdout } = await run([flag], EFFECTS);

      expect(exitCode).toBe(0);
      expect(stderr).toBe('');
      expect(stdout).toContain('Usage: thor-demo [options] <command>');
      expect(stdout).toMatch(/mcp .*\n.*probe .*\n.*render /);
      expect(stdout).toContain('Otherwise, the exit code of aidemo');
    });

    it('prints the root help when given no arguments', async () => {
      const bare = await run([], EFFECTS);

      expect(bare).toStrictEqual(await run(['--help'], EFFECTS));
      expect(bare.exitCode).toBe(0);
    });

    it.each([['--version'], ['-V']])('prints the resolved version on %o', async (flag) => {
      await expect(run([flag], EFFECTS)).resolves.toStrictEqual({
        exitCode: 0,
        launch: undefined,
        revoice: undefined,
        stderr: '',
        stdout: `${VERSION}\n`,
        voice: undefined,
      });
    });

    it('reports a failure to resolve the version as a usage error', async () => {
      const failing: RunEffects = {
        ...EFFECTS,
        resolveVersion: () => {
          throw new Error('The manifest declares no version.');
        },
      };

      await expect(run(['--version'], failing)).resolves.toStrictEqual({
        exitCode: 2,
        launch: undefined,
        revoice: undefined,
        stderr: "Error: The manifest declares no version.\nTry 'thor-demo --help'.\n",
        stdout: '',
        voice: undefined,
      });
    });

    it.each([
      ['render', ['--help']],
      ['probe', ['-h']],
      ['render', ['quickstart', '--tts', 'local', '--help']],
    ])('prints the help of %s for %o without reading any configuration', async (command, args) => {
      const { exitCode, launch, stdout } = await run([command, ...args], EFFECTS);

      expect(exitCode).toBe(0);
      expect(launch).toBeUndefined();
      expect(stdout).toContain(`Usage: thor-demo ${command}`);
      expect(stdout).toContain('Example:');
    });

    it.each([['--help'], ['-h']])('prints the help of mcp on %o', async (flag) => {
      const { exitCode, stdout } = await run(['mcp', flag], EFFECTS);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Usage: thor-demo mcp');
      expect(stdout).toContain('"args": ["mcp"]');
    });
  });

  describe('given a bad invocation', () => {
    it.each([
      { args: ['nope'], expected: 'Error: Unknown command: nope' },
      { args: ['--bogus'], expected: 'Error: Unknown option: --bogus' },
      { args: ['render'], expected: 'Error: expects a demo name before any option' },
      { args: ['probe', '--golden'], expected: 'Error: expects a demo name before any option' },
    ])('exits 2, pointing at the help: $args', async ({ args, expected }) => {
      const { exitCode, launch, stderr, stdout } = await run(args, EFFECTS);

      expect(exitCode).toBe(2);
      expect(launch).toBeUndefined();
      expect(stdout).toBe('');
      expect(stderr).toContain(expected);
      expect(stderr).toMatch(/Try 'thor-demo( \w+)? --help'\./);
    });

    it('rejects an argument to mcp', async () => {
      using tree = createDemoRepo();

      const { exitCode, launch } = await run(['mcp', 'extra'], { ...EFFECTS, cwd: tree.dir });

      expect(exitCode).toBe(2);
      expect(launch).toBeUndefined();
    });
  });

  describe.each([['render'], ['probe']])('%s', (command) => {
    it('launches the aidemo command on the demo from the repository root', async () => {
      using tree = createDemoRepo();
      const noRootNotice: unknown = expect.stringContaining('no archive root');

      const { exitCode, launch, stderr } = await run([command, 'demos/quickstart', '--tts', 'local'], {
        ...EFFECTS,
        cwd: tree.resolve('demos'),
      });

      expect(exitCode).toBe(0);
      expect(stderr).toBe('');
      expect(launch).toStrictEqual({
        args: [command, tree.resolve('demos/quickstart'), '--tts', 'local'],
        bin: tree.resolve('node_modules/@tandryukha/aidemo/bin/aidemo.mjs'),
        cwd: tree.dir,
        env: {},
        ...(command === 'render' && { take: { kind: 'notice', message: noRootNotice } }),
      });
    });

    it('forwards the arguments after a literal --, help flags included', async () => {
      using tree = createDemoRepo();

      const { launch } = await run([command, 'quickstart', '--golden', '--', '--help'], { ...EFFECTS, cwd: tree.dir });

      expect(launch?.args).toStrictEqual([command, tree.resolve('demos/quickstart'), '--golden', '--help']);
    });

    it('lists the demos for an unknown one, as a usage error', async () => {
      using tree = createDemoRepo();

      const { exitCode, launch, stderr } = await run([command, 'quick'], { ...EFFECTS, cwd: tree.dir });

      expect(exitCode).toBe(2);
      expect(launch).toBeUndefined();
      expect(stderr).toContain('unknown demo "quick"; the demos in demos are: quickstart');
    });

    it('reports a missing configuration with exit 1', async () => {
      using tree = createTempTree({ 'x/.keep': '' });

      const { exitCode, launch, stderr } = await run([command, 'quickstart'], { ...EFFECTS, cwd: tree.dir });

      expect(exitCode).toBe(1);
      expect(launch).toBeUndefined();
      expect(stderr).toMatch(new RegExp(String.raw`^thor-demo ${command}: \.config/thor-demo\.yaml not found`));
    });

    it('refuses an unsupported aidemo with exit 1', async () => {
      using tree = createDemoRepo({ aidemoVersion: '0.15.2' });

      const { exitCode, launch, stderr } = await run([command, 'quickstart'], { ...EFFECTS, cwd: tree.dir });

      expect(exitCode).toBe(1);
      expect(launch).toBeUndefined();
      expect(stderr).toContain('0.15.2 is installed');
      expect(stderr).toContain('pnpm add --save-dev @tandryukha/aidemo');
    });
  });

  describe('render archiving', () => {
    it('attaches an archive plan when an archive root is set', async () => {
      using tree = createDemoRepo({ config: 'archive:\n  label: product\n' });
      const source = { commit: 'abc1234def', dirty: true };

      const { exitCode, launch } = await run(['render', 'quickstart', '--tts', 'local'], {
        ...EFFECTS,
        cwd: tree.dir,
        env: { THOR_DEMO_ARCHIVE_ROOT: '/archive' },
        readSourceState: () => source,
      });

      expect(exitCode).toBe(0);
      expect(launch?.take).toMatchObject({
        kind: 'archive',
        plan: {
          aidemoVersion: '0.20.0',
          archiveRoot: '/archive',
          demo: 'quickstart',
          demoDir: tree.resolve('demos/quickstart'),
          label: 'product',
          params: ['--tts', 'local'],
          source,
          voice: { provider: 'local', voiceId: 'af_heart' },
        },
      });
    });

    it('attaches a notice for a variant render', async () => {
      using tree = createDemoRepo();

      const { launch } = await run(['render', 'quickstart', '--', '--langs', 'de,fr'], {
        ...EFFECTS,
        cwd: tree.dir,
        env: { THOR_DEMO_ARCHIVE_ROOT: '/archive' },
      });

      expect(launch?.take).toStrictEqual({
        kind: 'notice',
        message: 'take not archived: --langs renders are not archived',
      });
    });

    it('reports a malformed machine configuration with exit 1, before launching', async () => {
      using tree = createDemoRepo({ extra: { 'home/.config/thor-demo/config.yaml': 'archive: [\n' } });

      const { exitCode, launch, stderr } = await run(['render', 'quickstart'], {
        ...EFFECTS,
        cwd: tree.dir,
        homeDir: tree.resolve('home'),
      });

      expect(exitCode).toBe(1);
      expect(launch).toBeUndefined();
      expect(stderr).toMatch(/^thor-demo render: .*config\.yaml: cannot be read as YAML/);
    });

    it('reports an unknown demo before reading the machine configuration', async () => {
      using tree = createDemoRepo({ extra: { 'home/.config/thor-demo/config.yaml': 'archive: [\n' } });

      const { exitCode } = await run(['render', 'quick'], { ...EFFECTS, cwd: tree.dir, homeDir: tree.resolve('home') });

      expect(exitCode).toBe(2);
    });

    it('does not read the machine configuration for probe', async () => {
      using tree = createDemoRepo({ extra: { 'home/.config/thor-demo/config.yaml': 'archive: [\n' } });

      const { exitCode, launch } = await run(['probe', 'quickstart'], {
        ...EFFECTS,
        cwd: tree.dir,
        homeDir: tree.resolve('home'),
      });

      expect(exitCode).toBe(0);
      expect(launch).not.toHaveProperty('take');
    });
  });

  describe('mcp', () => {
    it('launches aidemo mcp from the repository root and writes nothing to stdout', async () => {
      using tree = createDemoRepo();

      const { exitCode, launch, stdout } = await run(['mcp'], { ...EFFECTS, cwd: tree.dir });

      expect(exitCode).toBe(0);
      expect(stdout).toBe('');
      expect(launch).toMatchObject({ args: ['mcp'], cwd: tree.dir });
    });

    it('refuses a missing aidemo with exit 1', async () => {
      using tree = createDemoRepo({ aidemoVersion: false });

      const { exitCode, launch, stderr, stdout } = await run(['mcp'], { ...EFFECTS, cwd: tree.dir });

      expect(exitCode).toBe(1);
      expect(launch).toBeUndefined();
      expect(stdout).toBe('');
      expect(stderr).toMatch(/^thor-demo mcp: @tandryukha\/aidemo is not installed/);
    });
  });

  describe('environment', () => {
    it('passes the declared environment and drops undeclared OpenAI variables', async () => {
      using tree = createDemoRepo({
        config: 'aidemo:\n  env:\n    AIDEMO_CHROME_PROFILE: ~/profile\n    OPENAI_BASE_URL: http://local\n',
      });

      const { launch } = await run(['mcp'], {
        ...EFFECTS,
        cwd: tree.dir,
        env: { OPENAI_API_KEY: 'sk-x', OPENAI_BASE_URL: 'http://remote', PATH: '/bin' },
      });

      expect(launch?.env).toStrictEqual({
        AIDEMO_CHROME_PROFILE: `${HOME}/profile`,
        OPENAI_BASE_URL: 'http://local',
        PATH: '/bin',
      });
    });

    it('reports an invalid configuration with exit 1', async () => {
      using tree = createDemoRepo({ config: 'aidemo:\n  env:\n    K: ${UNSET}\n' });

      const { exitCode, stderr } = await run(['mcp'], { ...EFFECTS, cwd: tree.dir });

      expect(exitCode).toBe(1);
      expect(stderr).toContain('aidemo.env.K: UNSET is not set');
    });
  });

  describe('voice setup', () => {
    it('requests the setup with the resolved voice configuration, outside any demo repository', async () => {
      using tree = createVoiceMachine();

      const result = await run(['voice', 'setup'], buildVoiceEffects(tree));

      expect(result).toStrictEqual({
        exitCode: 0,
        launch: undefined,
        revoice: undefined,
        stderr: '',
        stdout: '',
        voice: {
          kind: 'setup',
          voice: {
            home: tree.resolve('home/.local/share/thor-demo/voice'),
            model: DEFAULT_VOICE_MODEL,
            referenceAudio: tree.resolve('home/reference.m4a'),
            referenceTranscript: tree.resolve('home/reference.txt'),
          },
        },
      });
    });

    it.each([
      ['linux', 'arm64'],
      ['darwin', 'x64'],
    ])('stops on %s on %s, naming the platform', async (platform, arch) => {
      using tree = createVoiceMachine();

      const result = await run(['voice', 'setup'], { ...buildVoiceEffects(tree), arch, platform });

      expect(result.exitCode).toBe(1);
      expect(result.voice).toBeUndefined();
      expect(result.stderr).toBe(
        `thor-demo voice setup: the voice clone runs on Apple Silicon (darwin on arm64) only, not ${platform} on ${arch}\n`,
      );
    });

    it.each([['uv'], ['ffmpeg']])('stops when %s is not on PATH, naming how to install it', async (tool) => {
      using tree = createVoiceMachine({ without: tool });

      const result = await run(['voice', 'setup'], buildVoiceEffects(tree));

      expect(result.exitCode).toBe(1);
      expect(result.voice).toBeUndefined();
      expect(result.stderr).toContain(`${tool} is not on PATH; install it with brew install ${tool}`);
    });

    it('names every missing tool in one message', async () => {
      using tree = createVoiceMachine({ tools: [] });

      const result = await run(['voice', 'setup'], buildVoiceEffects(tree));

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe(
        'thor-demo voice setup: uv and ffmpeg are not on PATH; install them with brew install uv ffmpeg\n',
      );
    });

    it('stops when the machine configuration does not set voice, naming the keys to add', async () => {
      using tree = createVoiceMachine({ config: 'archive:\n  root: /takes\n' });

      const { exitCode, stderr } = await run(['voice', 'setup'], buildVoiceEffects(tree));

      expect(exitCode).toBe(1);
      expect(stderr).toContain('does not set voice; add voice.reference.audio and voice.reference.transcript');
    });

    it('stops on a malformed voice section, naming the key', async () => {
      using tree = createVoiceMachine({ config: 'voice:\n  modle: x\n' });

      const { exitCode, stderr } = await run(['voice', 'setup'], buildVoiceEffects(tree));

      expect(exitCode).toBe(1);
      expect(stderr).toContain('unknown key "voice.modle"; the keys are home, model, and reference');
    });

    it('is not stopped by a malformed archive section', async () => {
      using tree = createVoiceMachine({ config: `archive: /takes\n${VOICE_SECTION}` });

      const { exitCode, voice } = await run(['voice', 'setup'], buildVoiceEffects(tree));

      expect(exitCode).toBe(0);
      expect(voice).toBeDefined();
    });

    it.each([
      ['audio', 'home/reference.m4a', 'record it with thor-demo voice record'],
      ['transcript', 'home/reference.txt', 'write in it exactly what the recording says'],
    ])('stops when the reference %s does not exist, naming how to make it', async (_label, file, hint) => {
      using tree = createVoiceMachine();
      rmSync(tree.resolve(file));

      const { exitCode, stderr, voice } = await run(['voice', 'setup'], buildVoiceEffects(tree));

      expect(exitCode).toBe(1);
      expect(voice).toBeUndefined();
      expect(stderr).toContain(`${tree.resolve(file)}, which does not exist; ${hint}`);
    });

    it('documents every voice key in its help', async () => {
      const { exitCode, stdout } = await run(['voice', 'setup', '--help'], EFFECTS);

      expect(exitCode).toBe(0);
      for (const key of ['voice.reference.audio', 'voice.reference.transcript', 'voice.home', 'voice.model']) {
        expect(stdout).toContain(key);
      }
    });

    it('lists the voice group in the root help', async () => {
      const { stdout } = await run(['--help'], EFFECTS);

      expect(stdout).toMatch(/\n\s+voice\s/);
    });
  });

  describe('voice record', () => {
    it('requests a recording from the named microphone before the reference exists', async () => {
      using tree = createVoiceMachine({ tools: ['ffmpeg', 'swiftc'] });
      rmSync(tree.resolve('home/reference.m4a'));

      const { exitCode, voice } = await run(['voice', 'record', '--microphone', 'Desk Mic'], {
        ...buildVoiceEffects(tree),
        arch: 'x64',
      });

      expect(exitCode).toBe(0);
      expect(voice).toMatchObject({
        kind: 'record',
        microphone: 'Desk Mic',
        voice: { referenceAudio: tree.resolve('home/reference.m4a') },
      });
    });

    it('leaves the microphone to the system when the flag is absent', async () => {
      using tree = createVoiceMachine({ tools: ['ffmpeg', 'swiftc'] });

      const { voice } = await run(['voice', 'record'], buildVoiceEffects(tree));

      expect(voice).toMatchObject({ kind: 'record', microphone: undefined });
    });

    it.each([
      ['swiftc', 'install the Xcode Command Line Tools with xcode-select --install'],
      ['ffmpeg', 'install it with brew install ffmpeg'],
    ])('stops when %s is not on PATH, naming how to install it', async (missing, hint) => {
      using tree = createVoiceMachine({ tools: ['ffmpeg', 'swiftc'].filter((tool) => tool !== missing) });

      const { exitCode, stderr } = await run(['voice', 'record'], buildVoiceEffects(tree));

      expect(exitCode).toBe(1);
      expect(stderr).toBe(`thor-demo voice record: ${missing} is not on PATH; ${hint}\n`);
    });

    it('stops outside macOS', async () => {
      using tree = createVoiceMachine({ tools: ['ffmpeg', 'swiftc'] });

      const { exitCode, stderr } = await run(['voice', 'record'], { ...buildVoiceEffects(tree), platform: 'linux' });

      expect(exitCode).toBe(1);
      expect(stderr).toContain('the recorder runs on macOS only, not linux');
    });
  });

  describe('voice microphones', () => {
    it('installs the recorder under the default voice home when the voice section is absent', async () => {
      using tree = createVoiceMachine({ config: '', tools: ['swiftc'] });

      const { exitCode, voice } = await run(['voice', 'microphones'], buildVoiceEffects(tree));

      expect(exitCode).toBe(0);
      expect(voice).toStrictEqual({ kind: 'microphones', home: tree.resolve('home/.local/share/thor-demo/voice') });
    });
  });
});

// region | Helpers

/** Returns effects whose home and `PATH` are in `tree`. */
function buildVoiceEffects(tree: TempTree): RunEffects {
  return { ...EFFECTS, env: { PATH: tree.resolve('bin') }, homeDir: tree.resolve('home') };
}

/**
 * Builds a machine whose home has a machine configuration and a reference recording and transcript, and whose `bin`
 * holds executable `tools`, leaving out `without`.
 */
function createVoiceMachine({
  config = VOICE_SECTION,
  tools = ['ffmpeg', 'uv'],
  without,
}: { config?: string; tools?: readonly string[]; without?: string } = {}): TempTree {
  const present = tools.filter((tool) => tool !== without);
  const tree = createTempTree({
    'home/.config/thor-demo/config.yaml': config,
    'home/reference.m4a': 'audio',
    'home/reference.txt': 'Hello.',
    ...Object.fromEntries(present.map((tool) => [`bin/${tool}`, ''])),
  });
  for (const tool of present) chmodSync(tree.resolve(`bin/${tool}`), 0o755);
  return tree;
}

/**
 * Builds a demo repository with one demo, `quickstart`, a fake aidemo of the given version, or none for `false`, and
 * `extra` files.
 */
function createDemoRepo({
  aidemoVersion = '0.20.0',
  config = '',
  extra = {},
}: { aidemoVersion?: string | false; config?: string; extra?: Record<string, string> } = {}): TempTree {
  return createTempTree({
    ...extra,
    '.config/thor-demo.yaml': config,
    'demos/quickstart/generated/storyboard.json': '{}',
    'package.json': '{}',
    ...(aidemoVersion !== false && {
      [AIDEMO_MANIFEST]: JSON.stringify({ version: aidemoVersion, bin: { aidemo: 'bin/aidemo.mjs' } }),
    }),
  });
}

// endregion | Helpers
