import { chmodSync, rmSync } from 'node:fs';
import path from 'node:path';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { resolveDefaultProfileDir } from '../../aidemo/build-aidemo-env.ts';
import { DEFAULT_VOICE_MODEL } from '../../config/read-machine-config.ts';
import { run, type RunEffects } from '../run.ts';
import { buildRunEffects, STUB_HOME_DIR, STUB_VERSION } from '../test-utils/build-run-effects.ts';
import { selectLaunch, selectVoice } from '../test-utils/select-request.ts';

const AIDEMO_MANIFEST = 'node_modules/@tandryukha/aidemo/package.json';

const VOICE_SECTION = 'voice:\n  reference:\n    audio: ~/reference.m4a\n    transcript: ~/reference.txt\n';

describe(run, () => {
  describe('help and version', () => {
    it.each([['--help'], ['-h']])('prints the root help on %o', async (flag) => {
      const { exitCode, stderr, stdout } = await run([flag], buildRunEffects());

      expect(exitCode).toBe(0);
      expect(stderr).toBe('');
      expect(stdout).toContain('Usage: thor-demo [options] <command>');
      expect(stdout).toMatch(/login .*\n.*mcp .*\n.*probe .*\n.*profile .*\n.*render /);
      expect(stdout).toContain('.local/share/thor-demo/chrome-profiles/<archive.label>');
      expect(stdout).toContain('Otherwise, the exit code of aidemo');
    });

    it('prints the root help when given no arguments', async () => {
      const bare = await run([], buildRunEffects());

      expect(bare).toStrictEqual(await run(['--help'], buildRunEffects()));
      expect(bare.exitCode).toBe(0);
    });

    it.each([['--version'], ['-V']])('prints the resolved version on %o', async (flag) => {
      await expect(run([flag], buildRunEffects())).resolves.toStrictEqual({
        exitCode: 0,
        request: undefined,
        stderr: '',
        stdout: `${STUB_VERSION}\n`,
      });
    });

    it('reports a failure to resolve the version as a usage error', async () => {
      const failing = buildRunEffects({
        resolveVersion: () => {
          throw new Error('The manifest declares no version.');
        },
      });

      await expect(run(['--version'], failing)).resolves.toStrictEqual({
        exitCode: 2,
        request: undefined,
        stderr: "thor-demo: The manifest declares no version.\nTry 'thor-demo --help'.\n",
        stdout: '',
      });
    });

    it.each([
      ['render', ['--help']],
      ['probe', ['-h']],
      ['render', ['quickstart', '--tts', 'local', '--help']],
    ])('prints the help of %s for %o without reading any configuration', async (command, args) => {
      const { exitCode, request, stdout } = await run([command, ...args], buildRunEffects());

      expect(exitCode).toBe(0);
      expect(request).toBeUndefined();
      expect(stdout).toContain(`Usage: thor-demo ${command}`);
      expect(stdout).toContain('Example:');
    });

    it.each([['--help'], ['-h']])('prints the help of mcp on %o', async (flag) => {
      const { exitCode, stdout } = await run(['mcp', flag], buildRunEffects());

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Usage: thor-demo mcp');
      expect(stdout).toContain('"args": ["mcp"]');
    });
  });

  describe('given a bad invocation', () => {
    it.each([
      { args: ['nope'], expected: 'thor-demo: Unknown command: nope' },
      { args: ['--bogus'], expected: 'thor-demo: Unknown option: --bogus' },
      { args: ['render'], expected: 'thor-demo: expects a demo name before any option' },
      { args: ['probe', '--golden'], expected: 'thor-demo: expects a demo name before any option' },
    ])('exits 2, pointing at the help: $args', async ({ args, expected }) => {
      const { exitCode, request, stderr, stdout } = await run(args, buildRunEffects());

      expect(exitCode).toBe(2);
      expect(request).toBeUndefined();
      expect(stdout).toBe('');
      expect(stderr).toContain(expected);
      expect(stderr).toMatch(/Try 'thor-demo( \w+)? --help'\./);
    });

    it('rejects an argument to mcp', async () => {
      using tree = createDemoRepo();

      const { exitCode, request } = await run(['mcp', 'extra'], buildRunEffects({ cwd: tree.dir }));

      expect(exitCode).toBe(2);
      expect(request).toBeUndefined();
    });
  });

  describe.each([['render'], ['probe']])('%s', (command) => {
    it('launches the aidemo command on the demo from the repository root', async () => {
      using tree = createDemoRepo();
      const noRootNotice: unknown = expect.stringContaining('no archive root');

      const effects = buildRunEffects({
        cwd: tree.resolve('demos'),
      });
      const { exitCode, request, stderr } = await run([command, 'demos/quickstart', '--tts', 'local'], effects);

      expect(exitCode).toBe(0);
      expect(stderr).toBe('');
      const profileDir = resolveDefaultProfileDir(STUB_HOME_DIR, path.basename(tree.dir));
      expect(selectLaunch(request)).toStrictEqual({
        args: [command, tree.resolve('demos/quickstart'), '--tts', 'local'],
        bin: tree.resolve('node_modules/@tandryukha/aidemo/bin/aidemo.mjs'),
        cwd: tree.dir,
        env: { AIDEMO_CHROME_PROFILE: profileDir },
        profileDir,
        ...(command === 'render' && { take: { kind: 'notice', message: noRootNotice } }),
      });
    });

    it('forwards the arguments after a literal --, help flags included', async () => {
      using tree = createDemoRepo();

      const effects = buildRunEffects({ cwd: tree.dir });
      const { request } = await run([command, 'quickstart', '--golden', '--', '--help'], effects);

      expect(selectLaunch(request)?.args).toStrictEqual([
        command,
        tree.resolve('demos/quickstart'),
        '--golden',
        '--help',
      ]);
    });

    it('warns about each working path that git does not ignore, before the launch', async () => {
      using tree = createDemoRepo();
      const checked: string[][] = [];

      const effects = buildRunEffects({
        cwd: tree.dir,
        findUnignoredPaths: (dir, paths) => {
          expect(dir).toBe(tree.dir);
          checked.push([...paths]);
          return paths.filter((candidate) => candidate.includes('/output/') || candidate.endsWith('params.json'));
        },
      });
      const { request, stderr } = await run([command, 'quickstart'], effects);

      expect(request?.kind).toBe('launch');
      expect(checked[0]).toContain('demos/quickstart/audio/voice.json');
      expect(stderr).toContain(
        `thor-demo ${command}: warning: demos/quickstart/generated/params.json is not ignored by git; aidemo writes it on every run\n` +
          `thor-demo ${command}: warning: demos/quickstart/output/ is not ignored by git; aidemo writes it on every run\n`,
      );
      expect(stderr.match(/warning:/g)).toHaveLength(2);
    });

    it('warns about a working path that contains a tracked file, unless its rule is already missing', async () => {
      using tree = createDemoRepo();

      const effects = buildRunEffects({
        cwd: tree.dir,
        findTrackedPaths: () => ['demos/quickstart/audio/', 'demos/quickstart/generated/captions.*'],
        findUnignoredPaths: () => ['demos/quickstart/audio/voice.json'],
      });
      const { stderr } = await run([command, 'quickstart'], effects);

      expect(stderr).toBe(
        `thor-demo ${command}: warning: demos/quickstart/audio/ is not ignored by git; aidemo writes it on every run\n` +
          `thor-demo ${command}: warning: demos/quickstart/generated/captions.* contains files tracked by git; aidemo rewrites them on every run\n`,
      );
    });

    it('describes the warning in its help', async () => {
      const { stdout } = await run([command, '--help'], buildRunEffects());

      expect(stdout).toContain("warning about each of aidemo's working paths");
    });

    it('does not warn when git covers every working path', async () => {
      using tree = createDemoRepo();

      const effects = buildRunEffects({
        cwd: tree.dir,
        findTrackedPaths: () => [],
        findUnignoredPaths: () => [],
      });
      const { stderr } = await run([command, 'quickstart'], effects);

      expect(stderr).not.toContain('warning:');
    });

    it('lists the demos for an unknown one, as a usage error', async () => {
      using tree = createDemoRepo();

      const { exitCode, request, stderr } = await run([command, 'quick'], buildRunEffects({ cwd: tree.dir }));

      expect(exitCode).toBe(2);
      expect(request).toBeUndefined();
      expect(stderr).toContain('unknown demo "quick"; the demos in demos are: quickstart');
    });

    it('reports a missing configuration with exit 1', async () => {
      using tree = createTempTree({ 'x/.keep': '' });

      const { exitCode, request, stderr } = await run([command, 'quickstart'], buildRunEffects({ cwd: tree.dir }));

      expect(exitCode).toBe(1);
      expect(request).toBeUndefined();
      expect(stderr).toMatch(new RegExp(String.raw`^thor-demo ${command}: \.config/thor-demo\.yaml not found`));
    });

    it('refuses an unsupported aidemo with exit 1', async () => {
      using tree = createDemoRepo({ aidemoVersion: '0.15.2' });

      const { exitCode, request, stderr } = await run([command, 'quickstart'], buildRunEffects({ cwd: tree.dir }));

      expect(exitCode).toBe(1);
      expect(request).toBeUndefined();
      expect(stderr).toContain('0.15.2 is installed');
      expect(stderr).toContain('pnpm add --save-dev @tandryukha/aidemo');
    });
  });

  describe('render archiving', () => {
    it('attaches an archive plan when an archive root is set', async () => {
      using tree = createDemoRepo({ config: 'archive:\n  label: product\n' });
      const source = { commit: 'abc1234def', dirty: true };

      const effects = buildRunEffects({
        cwd: tree.dir,
        env: { THOR_DEMO_ARCHIVE_ROOT: '/archive' },
        readSourceState: () => source,
      });
      const { exitCode, request } = await run(['render', 'quickstart', '--tts', 'local'], effects);

      expect(exitCode).toBe(0);
      expect(selectLaunch(request)?.take).toMatchObject({
        kind: 'archive',
        plan: {
          aidemoVersion: '0.20.3',
          archiveRoot: '/archive',
          demo: 'quickstart',
          demoDir: tree.resolve('demos/quickstart'),
          label: 'product',
          params: ['--tts', 'local'],
          source,
        },
      });
    });

    it('attaches a notice for a variant render', async () => {
      using tree = createDemoRepo();

      const effects = buildRunEffects({
        cwd: tree.dir,
        env: { THOR_DEMO_ARCHIVE_ROOT: '/archive' },
      });
      const { request } = await run(['render', 'quickstart', '--', '--langs', 'de,fr'], effects);

      expect(selectLaunch(request)?.take).toStrictEqual({
        kind: 'notice',
        message: 'take not archived: --langs renders are not archived',
      });
    });

    it('reports a malformed machine configuration with exit 1, before launching', async () => {
      using tree = createDemoRepo({ extra: { 'home/.config/thor-demo/config.yaml': 'archive: [\n' } });

      const effects = buildRunEffects({
        cwd: tree.dir,
        homeDir: tree.resolve('home'),
      });
      const { exitCode, request, stderr } = await run(['render', 'quickstart'], effects);

      expect(exitCode).toBe(1);
      expect(request).toBeUndefined();
      expect(stderr).toMatch(/^thor-demo render: .*config\.yaml: cannot be read as YAML/);
    });

    it('reports an unknown demo before reading the machine configuration', async () => {
      using tree = createDemoRepo({ extra: { 'home/.config/thor-demo/config.yaml': 'archive: [\n' } });

      const effects = buildRunEffects({ cwd: tree.dir, homeDir: tree.resolve('home') });
      const { exitCode } = await run(['render', 'quick'], effects);

      expect(exitCode).toBe(2);
    });

    it('does not read the machine configuration for probe', async () => {
      using tree = createDemoRepo({ extra: { 'home/.config/thor-demo/config.yaml': 'archive: [\n' } });

      const effects = buildRunEffects({
        cwd: tree.dir,
        homeDir: tree.resolve('home'),
      });
      const { exitCode, request } = await run(['probe', 'quickstart'], effects);

      expect(exitCode).toBe(0);
      expect(selectLaunch(request)).not.toHaveProperty('take');
    });
  });

  describe('mcp', () => {
    it('launches aidemo mcp from the repository root and writes nothing to stdout', async () => {
      using tree = createDemoRepo();

      const effects = buildRunEffects({
        cwd: tree.dir,
        findUnignoredPaths: (_dir, paths) => paths,
      });
      const { exitCode, request, stderr, stdout } = await run(['mcp'], effects);

      expect(exitCode).toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toBe('');
      expect(selectLaunch(request)).toMatchObject({ args: ['mcp'], cwd: tree.dir });
    });

    it('refuses a missing aidemo with exit 1', async () => {
      using tree = createDemoRepo({ aidemoVersion: false });

      const { exitCode, request, stderr, stdout } = await run(['mcp'], buildRunEffects({ cwd: tree.dir }));

      expect(exitCode).toBe(1);
      expect(request).toBeUndefined();
      expect(stdout).toBe('');
      expect(stderr).toMatch(/^thor-demo mcp: @tandryukha\/aidemo is not installed/);
    });
  });

  describe('environment', () => {
    it('passes the declared environment and drops undeclared OpenAI variables', async () => {
      using tree = createDemoRepo({
        config: 'aidemo:\n  env:\n    AIDEMO_CHROME_PROFILE: ~/profile\n    OPENAI_BASE_URL: http://local\n',
      });

      const effects = buildRunEffects({
        cwd: tree.dir,
        env: { OPENAI_API_KEY: 'sk-x', OPENAI_BASE_URL: 'http://remote', PATH: '/bin' },
      });
      const { request } = await run(['mcp'], effects);

      expect(selectLaunch(request)?.env).toStrictEqual({
        AIDEMO_CHROME_PROFILE: `${STUB_HOME_DIR}/profile`,
        OPENAI_BASE_URL: 'http://local',
        PATH: '/bin',
      });
    });

    it('defaults the recording profile to one keyed by the archive label, for the entry point to create', async () => {
      using tree = createDemoRepo({ config: 'archive:\n  label: product\n' });

      const { request } = await run(['mcp'], buildRunEffects({ cwd: tree.dir, env: { AIDEMO_CHROME_PROFILE: '' } }));

      const profileDir = `${STUB_HOME_DIR}/.local/share/thor-demo/chrome-profiles/product`;
      expect(selectLaunch(request)).toMatchObject({ env: { AIDEMO_CHROME_PROFILE: profileDir }, profileDir });
    });

    it('leaves an inherited profile to aidemo without asking the entry point to create one', async () => {
      using tree = createDemoRepo();

      const effects = buildRunEffects({ cwd: tree.dir, env: { AIDEMO_CHROME_PROFILE: '/profile' } });
      const { request } = await run(['mcp'], effects);

      expect(selectLaunch(request)?.env).toStrictEqual({ AIDEMO_CHROME_PROFILE: '/profile' });
      expect(selectLaunch(request)?.profileDir).toBeUndefined();
    });

    it('reports an invalid configuration with exit 1', async () => {
      using tree = createDemoRepo({ config: 'aidemo:\n  env:\n    K: ${UNSET}\n' });

      const { exitCode, stderr } = await run(['mcp'], buildRunEffects({ cwd: tree.dir }));

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
        request: {
          kind: 'voice',
          voice: {
            kind: 'setup',
            voice: {
              home: tree.resolve('home/.local/share/thor-demo/voice'),
              model: DEFAULT_VOICE_MODEL,
              referenceAudio: tree.resolve('home/reference.m4a'),
              referenceTranscript: tree.resolve('home/reference.txt'),
            },
          },
        },
        stderr: '',
        stdout: '',
      });
    });

    it.each([
      ['linux', 'arm64'],
      ['darwin', 'x64'],
    ])('stops on %s on %s, naming the platform', async (platform, arch) => {
      using tree = createVoiceMachine();

      const result = await run(['voice', 'setup'], { ...buildVoiceEffects(tree), arch, platform });

      expect(result.exitCode).toBe(1);
      expect(result.request).toBeUndefined();
      expect(result.stderr).toBe(
        `thor-demo voice setup: the voice clone runs on Apple Silicon (darwin on arm64) only, not ${platform} on ${arch}\n`,
      );
    });

    it.each([['uv'], ['ffmpeg']])('stops when %s is not on PATH, naming how to install it', async (tool) => {
      using tree = createVoiceMachine({ without: tool });

      const result = await run(['voice', 'setup'], buildVoiceEffects(tree));

      expect(result.exitCode).toBe(1);
      expect(result.request).toBeUndefined();
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

      const { exitCode, request } = await run(['voice', 'setup'], buildVoiceEffects(tree));

      expect(exitCode).toBe(0);
      expect(request?.kind).toBe('voice');
    });

    it.each([
      ['audio', 'home/reference.m4a', 'record it with thor-demo voice record'],
      ['transcript', 'home/reference.txt', 'write in it exactly what the recording says'],
    ])('stops when the reference %s does not exist, naming how to make it', async (_label, file, hint) => {
      using tree = createVoiceMachine();
      rmSync(tree.resolve(file));

      const { exitCode, request, stderr } = await run(['voice', 'setup'], buildVoiceEffects(tree));

      expect(exitCode).toBe(1);
      expect(request).toBeUndefined();
      expect(stderr).toContain(`${tree.resolve(file)}, which does not exist; ${hint}`);
    });

    it('documents every voice key in its help', async () => {
      const { exitCode, stdout } = await run(['voice', 'setup', '--help'], buildRunEffects());

      expect(exitCode).toBe(0);
      for (const key of ['voice.reference.audio', 'voice.reference.transcript', 'voice.home', 'voice.model']) {
        expect(stdout).toContain(key);
      }
    });

    it('lists the voice group in the root help', async () => {
      const { stdout } = await run(['--help'], buildRunEffects());

      expect(stdout).toMatch(/\n\s+voice\s/);
    });
  });

  describe('voice record', () => {
    it('requests a recording from the named microphone before the reference exists', async () => {
      using tree = createVoiceMachine({ tools: ['ffmpeg', 'swiftc'] });
      rmSync(tree.resolve('home/reference.m4a'));

      const { exitCode, request } = await run(['voice', 'record', '--microphone', 'Desk Mic'], {
        ...buildVoiceEffects(tree),
        arch: 'x64',
      });

      expect(exitCode).toBe(0);
      expect(selectVoice(request)).toMatchObject({
        kind: 'record',
        microphone: 'Desk Mic',
        voice: { referenceAudio: tree.resolve('home/reference.m4a') },
      });
    });

    it('leaves the microphone to the system when the flag is absent', async () => {
      using tree = createVoiceMachine({ tools: ['ffmpeg', 'swiftc'] });

      const { request } = await run(['voice', 'record'], buildVoiceEffects(tree));

      expect(selectVoice(request)).toMatchObject({ kind: 'record', microphone: undefined });
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

      const { exitCode, request } = await run(['voice', 'microphones'], buildVoiceEffects(tree));

      expect(exitCode).toBe(0);
      expect(selectVoice(request)).toStrictEqual({
        kind: 'microphones',
        home: tree.resolve('home/.local/share/thor-demo/voice'),
      });
    });
  });
});

// region | Helpers

/** Returns effects whose home and `PATH` are in `tree`. */
function buildVoiceEffects(tree: TempTree): RunEffects {
  return buildRunEffects({ env: { PATH: tree.resolve('bin') }, homeDir: tree.resolve('home') });
}

/**
 * Builds a demo repository with one demo, `quickstart`, a fake aidemo of the given version, or none for `false`, and
 * `extra` files.
 */
function createDemoRepo({
  aidemoVersion = '0.20.3',
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

// endregion | Helpers
