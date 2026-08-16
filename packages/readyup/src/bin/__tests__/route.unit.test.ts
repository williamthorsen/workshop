import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunCommand = vi.hoisted(() => vi.fn());
const mockInitCommand = vi.hoisted(() => vi.fn());
const mockCompileCommand = vi.hoisted(() => vi.fn());
const mockListCommand = vi.hoisted(() => vi.fn());
const mockParseRunArgs = vi.hoisted(() => vi.fn());
const mockResolveKitSources = vi.hoisted(() => vi.fn());
const mockLoadConfig = vi.hoisted(() => vi.fn());

vi.mock(import('../../run/parseRunArgs.ts'), () => ({
  parseRunArgs: mockParseRunArgs,
}));

vi.mock(import('../../run/resolveKitSources.ts'), () => ({
  resolveKitSources: mockResolveKitSources,
}));

vi.mock(import('../../run/runCommand.ts'), () => ({
  runCommand: mockRunCommand,
}));

vi.mock(import('../../config/loadConfig.ts'), () => ({
  loadConfig: mockLoadConfig,
}));

vi.mock(import('../../compile/compileCommand.ts'), () => ({
  compileCommand: mockCompileCommand,
}));

vi.mock(import('../../init/initCommand.ts'), () => ({
  initCommand: mockInitCommand,
}));

vi.mock(import('../../list/listCommand.ts'), () => ({
  listCommand: mockListCommand,
}));

vi.mock('../../version.ts', () => ({
  VERSION: '1.2.3',
}));

import packageJson from '../../../package.json' with { type: 'json' };
import { usageError } from '../../errors/RdyError.ts';
import { DOCS_POINTER, routeCommand } from '../route.ts';

/** Scratch project root for the tests that need a kit file on disk. */
const TYPO_TEST_DIR = join(import.meta.dirname, '../../../.test-tmp-route');

describe(routeCommand, () => {
  beforeEach(() => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
      internal: { dir: '.', infix: undefined },
    });
    mockResolveKitSources.mockReturnValue([
      { name: 'default', source: { path: '.readyup/kits/default.js' }, checklists: [] },
    ]);
  });

  afterEach(() => {
    rmSync(TYPO_TEST_DIR, { recursive: true, force: true });
    vi.restoreAllMocks();
    mockRunCommand.mockReset();
    mockCompileCommand.mockReset();
    mockInitCommand.mockReset();
    mockListCommand.mockReset();
    mockParseRunArgs.mockReset();
    mockResolveKitSources.mockReset();
    mockLoadConfig.mockReset();
  });

  it('shows help and returns 0 when no arguments are given', async () => {
    const { exitCode, stdout } = await route([]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage: rdy');
  });

  it('shows help and returns 0 for --help', async () => {
    const { exitCode, stdout } = await route(['--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage: rdy');
  });

  it('shows help and returns 0 for -h', async () => {
    const { exitCode } = await route(['-h']);

    expect(exitCode).toBe(0);
  });

  it('prints version and returns 0 for --version', async () => {
    const { exitCode, stdout } = await route(['--version']);

    expect(exitCode).toBe(0);
    expect(stdout).toBe('1.2.3\n');
  });

  it('prints version and returns 0 for -V', async () => {
    const { exitCode, stdout } = await route(['-V']);

    expect(exitCode).toBe(0);
    expect(stdout).toBe('1.2.3\n');
  });

  it('includes run options in top-level help', async () => {
    const { stdout } = await route(['--help']);

    expect(stdout).toContain('--from');
    expect(stdout).toContain('--file, -f');
    expect(stdout).toContain('--url');
    expect(stdout).toContain('--jit');
    expect(stdout).toContain('--internal');
    expect(stdout).toContain('--checklists, -c');
    expect(stdout).toContain('--json');
    expect(stdout).toContain('--version, -V');
  });

  it.each([
    { label: 'top-level', args: ['--help'] },
    { label: 'run', args: ['run', '--help'] },
    { label: 'init', args: ['init', '--help'] },
  ])('names no retired short flag in $label help', async ({ args }) => {
    const { stdout } = await route(args);

    for (const short of ['-J', '-F', '-R', '-i', '-u', '-j']) {
      expect(stdout).not.toContain(`, ${short}`);
    }
  });

  it('marks run as the default command in top-level help', async () => {
    const { stdout } = await route(['--help']);

    expect(stdout).toContain('(default)');
  });

  it('points at per-command help from top-level help', async () => {
    const { stdout } = await route(['--help']);

    expect(stdout).toContain("Run 'rdy <command> --help' for command-specific options.");
  });

  it.each([
    { label: 'top-level', args: ['--help'] },
    { label: 'run', args: ['run', '--help'] },
    { label: 'compile', args: ['compile', '--help'] },
    { label: 'init', args: ['init', '--help'] },
    { label: 'list', args: ['list', '--help'] },
    { label: 'verify', args: ['verify', '--help'] },
  ])('points at the documentation from $label help', async ({ args }) => {
    const { stdout } = await route(args);

    expect(stdout).toContain(DOCS_POINTER);
  });

  it('points at the documented package homepage', () => {
    expect(DOCS_POINTER.endsWith(packageJson.homepage)).toBe(true);
  });

  it.each([
    { label: 'exit codes', text: 'Exit codes:' },
    { label: 'schema evolution', text: 'schemaVersion' },
  ])('leaves $label to the documentation rather than top-level help', async ({ text }) => {
    const { stdout } = await route(['--help']);

    expect(stdout).not.toContain(text);
  });

  it.each([
    { label: 'top-level', args: ['--help'] },
    { label: 'run', args: ['run', '--help'] },
    { label: 'list', args: ['list', '--help'] },
  ])('shows examples in $label help', async ({ args }) => {
    const { stdout } = await route(args);

    expect(stdout).toContain('Examples:');
  });

  it('explains how to escape a positional starting with a dash in run help', async () => {
    const { stdout } = await route(['run', '--help']);

    expect(stdout).toContain('rdy run -- "--odd-kit-name"');
  });

  it('shows run help and returns 0 for run --help', async () => {
    const { exitCode, stdout } = await route(['run', '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage: rdy run');
  });

  it('shows init help and returns 0 for init --help', async () => {
    const { exitCode, stdout } = await route(['init', '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage: rdy init');
  });

  it('shows init help and returns 0 for init -h', async () => {
    const { exitCode } = await route(['init', '-h']);

    expect(exitCode).toBe(0);
  });

  it('delegates to runCommand for run subcommand', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [{ kitName: 'deploy', checklists: [] }],
      checklists: undefined,
      filePath: undefined,
      fromValue: undefined,
      urlValue: undefined,
      jit: false,
      internal: false,
      json: false,
    });
    mockRunCommand.mockResolvedValue(0);

    const { exitCode } = await route(['run', 'deploy']);

    expect(mockParseRunArgs).toHaveBeenCalledWith(['deploy']);
    expect(mockRunCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        kitEntries: [{ name: 'default', source: { path: '.readyup/kits/default.js' }, checklists: [] }],
        json: false,
      }),
      false,
    );
    expect(exitCode).toBe(0);
  });

  it('forwards jit flag to runCommand when --jit is set', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [],
      checklists: undefined,
      filePath: undefined,
      fromValue: undefined,
      urlValue: undefined,
      jit: true,
      internal: false,
      json: false,
    });
    mockRunCommand.mockResolvedValue(0);

    const { exitCode } = await route(['run', '--jit']);

    expect(mockRunCommand).toHaveBeenCalledWith(expect.anything(), true);
    expect(exitCode).toBe(0);
  });

  it('passes --json flag through to runCommand', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [],
      checklists: undefined,
      filePath: undefined,
      fromValue: undefined,
      urlValue: undefined,
      jit: false,
      internal: false,
      json: true,
    });
    mockRunCommand.mockResolvedValue(0);

    const { exitCode } = await route(['run', '--json']);

    expect(mockRunCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        json: true,
      }),
      false,
    );
    expect(exitCode).toBe(0);
  });

  it('includes --json in run help text', async () => {
    const { stdout } = await route(['run', '--help']);

    expect(stdout).toContain('--json');
  });

  it('returns 2 and writes to stderr when parseRunArgs throws', async () => {
    mockParseRunArgs.mockImplementation(() => {
      throw new Error("unknown flag '--bad'");
    });

    const { exitCode, stderr } = await route(['run', '--bad']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("unknown flag '--bad'");
  });

  it('returns 2 and writes to stderr when resolveKitSources throws', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [],
      checklists: undefined,
      filePath: 'path.ts',
      fromValue: undefined,
      urlValue: undefined,
      jit: false,
      internal: false,
      json: false,
    });
    mockResolveKitSources.mockImplementation(() => {
      throw new Error('resolution failed');
    });

    const { exitCode, stderr } = await route(['run', '--file', 'path.ts']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('resolution failed');
  });

  it('returns 2 and writes to stderr when loadConfig rejects', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [],
      checklists: undefined,
      filePath: undefined,
      fromValue: undefined,
      urlValue: undefined,
      jit: false,
      internal: false,
      json: false,
    });
    mockLoadConfig.mockRejectedValue(new Error('bad config'));

    const { exitCode, stderr } = await route(['run']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('bad config');
  });

  it('writes a hint on a line of its own, under the style the invocation selected', async () => {
    mockParseRunArgs.mockImplementation(() => {
      throw usageError('nothing found', { hint: 'Set GITHUB_TOKEN.' });
    });

    const { exitCode, stderrChunks } = await route(['--style', 'plain', 'run', '--bad']);

    expect(exitCode).toBe(2);
    expect(stderrChunks).toStrictEqual(['Error: nothing found\n', 'Hint: Set GITHUB_TOKEN.\n']);
  });

  it('renders the hint through the rich style by default', async () => {
    mockParseRunArgs.mockImplementation(() => {
      throw usageError('nothing found', { hint: 'Set GITHUB_TOKEN.' });
    });

    const { stderr } = await route(['run', '--bad']);

    expect(stderr).toContain('💡 Hint: Set GITHUB_TOKEN.\n');
  });

  it('forwards an install hint from a config file whose imports could not be resolved', async () => {
    mockParseRunArgs.mockReturnValue(parsedRunArgs({ json: true }));
    mockLoadConfig.mockRejectedValue(
      Object.assign(new Error("Cannot resolve 'some-lib' while evaluating config.ts."), {
        hint: 'Install it with: pnpm add --save-dev some-lib',
      }),
    );

    const { exitCode, stdout } = await route(['run', '--json']);

    expect(exitCode).toBe(2);
    expect(JSON.parse(stdout)).toStrictEqual({
      schemaVersion: 1,
      error: {
        code: 'config',
        message: "Cannot resolve 'some-lib' while evaluating config.ts.",
        hint: 'Install it with: pnpm add --save-dev some-lib',
      },
    });
  });

  it('writes no hint line for a failure that carries none', async () => {
    mockParseRunArgs.mockImplementation(() => {
      throw usageError('nothing found');
    });

    const { stderrChunks } = await route(['run', '--bad']);

    expect(stderrChunks).toHaveLength(1);
  });

  // -- Config loading: external sources skip loadConfig --

  it('does not call loadConfig when --file is used', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [],
      checklists: undefined,
      filePath: 'kit.ts',
      fromValue: undefined,
      urlValue: undefined,
      jit: false,
      internal: false,
      json: false,
    });
    mockResolveKitSources.mockReturnValue([{ name: 'kit.ts', source: { path: 'kit.ts' }, checklists: [] }]);
    mockRunCommand.mockResolvedValue(0);

    await route(['run', '--file', 'kit.ts']);

    expect(mockLoadConfig).not.toHaveBeenCalled();
  });

  it('does not call loadConfig when --from is used', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [{ kitName: 'deploy', checklists: [] }],
      checklists: undefined,
      filePath: undefined,
      fromValue: 'github:org/repo',
      urlValue: undefined,
      jit: false,
      internal: false,
      json: false,
    });
    mockResolveKitSources.mockReturnValue([
      { name: 'deploy', source: { url: 'https://example.com/deploy.js' }, checklists: [] },
    ]);
    mockRunCommand.mockResolvedValue(0);

    await route(['run', '--from', 'github:org/repo', 'deploy']);

    expect(mockLoadConfig).not.toHaveBeenCalled();
  });

  it('does not call loadConfig when --url is used', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [],
      checklists: undefined,
      filePath: undefined,
      fromValue: undefined,
      urlValue: 'https://example.com/kit.js',
      jit: false,
      internal: false,
      json: false,
    });
    mockResolveKitSources.mockReturnValue([
      { name: 'https://example.com/kit.js', source: { url: 'https://example.com/kit.js' }, checklists: [] },
    ]);
    mockRunCommand.mockResolvedValue(0);

    await route(['run', '--url', 'https://example.com/kit.js']);

    expect(mockLoadConfig).not.toHaveBeenCalled();
  });

  it('calls loadConfig for default run (no source flags)', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [],
      checklists: undefined,
      filePath: undefined,
      fromValue: undefined,
      urlValue: undefined,
      jit: false,
      internal: false,
      json: false,
    });
    mockRunCommand.mockResolvedValue(0);

    await route(['run']);

    expect(mockLoadConfig).toHaveBeenCalled();
  });

  it('calls loadConfig when --internal is used', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [],
      checklists: undefined,
      filePath: undefined,
      fromValue: undefined,
      urlValue: undefined,
      jit: false,
      internal: true,
      json: false,
    });
    mockRunCommand.mockResolvedValue(0);

    await route(['run', '--internal']);

    expect(mockLoadConfig).toHaveBeenCalled();
  });

  it('shows compile help and returns 0 for compile --help', async () => {
    const { exitCode, stdout } = await route(['compile', '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage: rdy compile');
    expect(stdout).toContain('If no file is given');
  });

  it('shows compile help and returns 0 for compile -h', async () => {
    const { exitCode } = await route(['compile', '-h']);

    expect(exitCode).toBe(0);
  });

  it('delegates to compileCommand for compile subcommand', async () => {
    mockCompileCommand.mockResolvedValue(0);

    const { exitCode } = await route(['compile', 'input.ts']);

    expect(mockCompileCommand).toHaveBeenCalledWith(['input.ts']);
    expect(exitCode).toBe(0);
  });

  it('passes --output flag through to compileCommand', async () => {
    mockCompileCommand.mockResolvedValue(0);

    const { exitCode } = await route(['compile', 'input.ts', '--output', 'out.js']);

    expect(mockCompileCommand).toHaveBeenCalledWith(['input.ts', '--output', 'out.js']);
    expect(exitCode).toBe(0);
  });

  it('lists compile in top-level help', async () => {
    const { stdout } = await route([]);

    expect(stdout).toContain('compile');
  });

  it('delegates to initCommand for init subcommand', async () => {
    mockInitCommand.mockReturnValue(0);

    const { exitCode } = await route(['init']);

    expect(mockInitCommand).toHaveBeenCalledWith({ dryRun: false, force: false });
    expect(exitCode).toBe(0);
  });

  it('passes --dry-run and --force flags to initCommand', async () => {
    mockInitCommand.mockReturnValue(0);

    const { exitCode } = await route(['init', '--dry-run', '--force']);

    expect(mockInitCommand).toHaveBeenCalledWith({ dryRun: true, force: true });
    expect(exitCode).toBe(0);
  });

  it('passes the -n short flag to initCommand', async () => {
    mockInitCommand.mockReturnValue(0);

    const { exitCode } = await route(['init', '-n']);

    expect(mockInitCommand).toHaveBeenCalledWith({ dryRun: true, force: false });
    expect(exitCode).toBe(0);
  });

  it('rejects the retired init -f short flag', async () => {
    const { exitCode } = await route(['init', '-f']);

    expect(exitCode).toBe(2);
    expect(mockInitCommand).not.toHaveBeenCalled();
  });

  it('returns 2 for unknown init flags', async () => {
    const { exitCode, stderr } = await route(['init', '--unknown']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("Unknown option '--unknown'");
  });

  it('shows list help and returns 0 for list --help', async () => {
    const { exitCode, stdout } = await route(['list', '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage: rdy list');
  });

  it('shows list help and returns 0 for list -h', async () => {
    const { exitCode } = await route(['list', '-h']);

    expect(exitCode).toBe(0);
  });

  it('delegates to listCommand for list subcommand', async () => {
    mockListCommand.mockResolvedValue(0);

    const { exitCode } = await route(['list']);

    expect(mockListCommand).toHaveBeenCalledWith([]);
    expect(exitCode).toBe(0);
  });

  it('passes --from flag through to listCommand', async () => {
    mockListCommand.mockResolvedValue(0);

    const { exitCode } = await route(['list', '--from', '.']);

    expect(mockListCommand).toHaveBeenCalledWith(['--from', '.']);
    expect(exitCode).toBe(0);
  });

  it('lists list in top-level help', async () => {
    const { stdout } = await route([]);

    expect(stdout).toContain('list');
  });

  describe('error envelope and stdout purity', () => {
    it('emits the error envelope on stdout and leaves stderr empty for a usage error under --json', async () => {
      mockParseRunArgs.mockImplementation(() => {
        throw usageError("Unknown option '--bogus'");
      });

      const { exitCode, stdout, stderr } = await route(['--json', '--bogus']);

      expect(exitCode).toBe(2);
      expect(JSON.parse(stdout)).toStrictEqual({
        schemaVersion: 1,
        error: { code: 'usage', message: "Unknown option '--bogus'" },
      });
      expect(stderr).toBe('');
    });

    it('carries a hint as its own envelope field, leaving the message unchanged', async () => {
      mockParseRunArgs.mockImplementation(() => {
        throw usageError('nothing found', { hint: 'Set GITHUB_TOKEN.' });
      });

      const { exitCode, stdout } = await route(['--json', '--bogus']);

      expect(exitCode).toBe(2);
      expect(JSON.parse(stdout)).toStrictEqual({
        schemaVersion: 1,
        error: { code: 'usage', message: 'nothing found', hint: 'Set GITHUB_TOKEN.' },
      });
    });

    it('classifies a config-load failure as a config error in the envelope', async () => {
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ json: true }));
      mockLoadConfig.mockRejectedValue(new Error('bad config'));

      const { exitCode, stdout } = await route(['run', '--json']);

      expect(exitCode).toBe(2);
      expect(JSON.parse(stdout)).toMatchObject({ error: { code: 'config', message: 'bad config' } });
    });

    it('classifies an undiagnosed failure as an internal error in the envelope', async () => {
      mockParseRunArgs.mockImplementation(() => {
        throw new Error('something unexpected');
      });

      const { exitCode, stdout } = await route(['--json']);

      expect(exitCode).toBe(2);
      expect(JSON.parse(stdout)).toMatchObject({ error: { code: 'internal', message: 'something unexpected' } });
    });

    it('emits an unknown-command error as an envelope rather than prose under --json', async () => {
      const { exitCode, stdout, stderr } = await route(['compil', '--json']);

      expect(exitCode).toBe(2);
      expect(JSON.parse(stdout)).toMatchObject({ error: { code: 'usage' } });
      expect(stderr).toBe('');
    });

    it('diverts help text to stderr under --json so stdout stays free of prose', async () => {
      const { exitCode, stdout, stderr } = await route(['--help', '--json']);

      expect(exitCode).toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toContain('Usage: rdy');
    });

    it('stops the --json scan at the `--` terminator', async () => {
      mockParseRunArgs.mockImplementation(() => {
        throw usageError('nope');
      });

      const { exitCode, stdout, stderr } = await route(['run', '--', '--json']);

      expect(exitCode).toBe(2);
      expect(stdout).toBe('');
      expect(stderr).toContain('nope');
    });
  });

  describe('default command routing', () => {
    it('routes flags to run when no subcommand is given', async () => {
      mockParseRunArgs.mockReturnValue({
        kitSpecifiers: [],
        checklists: undefined,
        filePath: 'foo.ts',
        fromValue: undefined,
        urlValue: undefined,
        jit: false,
        internal: false,
        json: false,
      });
      mockRunCommand.mockResolvedValue(0);

      const { exitCode } = await route(['--file', 'foo.ts']);

      expect(mockParseRunArgs).toHaveBeenCalledWith(['--file', 'foo.ts']);
      expect(exitCode).toBe(0);
    });

    it('routes positional args to run as kit specifiers', async () => {
      mockParseRunArgs.mockReturnValue({
        kitSpecifiers: [{ kitName: 'onboarding', checklists: [] }],
        checklists: undefined,
        filePath: undefined,
        fromValue: undefined,
        urlValue: undefined,
        jit: false,
        internal: false,
        json: false,
      });
      mockRunCommand.mockResolvedValue(0);

      const { exitCode } = await route(['onboarding']);

      expect(mockParseRunArgs).toHaveBeenCalledWith(['onboarding']);
      expect(exitCode).toBe(0);
    });
  });

  describe('typo detection', () => {
    it.each([
      ['co', 'compile'],
      ['comp', 'compile'],
      ['comple', 'compile'],
      ['compil', 'compile'],
      ['ini', 'init'],
      ['lis', 'list'],
      ['lst', 'list'],
      ['runn', 'run'],
      ['verfy', 'verify'],
    ])('suggests "%s" -> "%s"', async (input, expected) => {
      const { exitCode, stderr } = await route([input]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain(`Did you mean 'rdy ${expected}'?`);
    });

    it('does not suggest for a word no command is close to', async () => {
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ kitSpecifiers: [{ kitName: 'onboarding', checklists: [] }] }));
      mockRunCommand.mockResolvedValue(0);

      const { exitCode, stderr } = await route(['onboarding']);

      expect(exitCode).toBe(0);
      expect(stderr).toBe('');
    });

    it('runs a bare word as a kit when a kit by that name exists', async () => {
      mkdirSync(join(TYPO_TEST_DIR, '.readyup/kits'), { recursive: true });
      writeFileSync(join(TYPO_TEST_DIR, '.readyup/kits/lst.js'), 'export const checklists = [];', 'utf8');
      vi.spyOn(process, 'cwd').mockReturnValue(TYPO_TEST_DIR);
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ kitSpecifiers: [{ kitName: 'lst', checklists: [] }] }));
      mockRunCommand.mockResolvedValue(0);

      const { exitCode } = await route(['lst']);

      expect(exitCode).toBe(0);
      expect(mockParseRunArgs).toHaveBeenCalledWith(['lst']);
    });

    it.each([
      ['--from', ['lst', '--from', 'global']],
      ['--from with an inline value', ['lst', '--from=global']],
      ['--file', ['lst', '--file', 'kit.js']],
      ['--url', ['lst', '--url', 'https://example.test/kit.js']],
      ['--internal', ['runn', '--internal']],
    ])('runs the bare word as a kit when %s names its source', async (_label, args) => {
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ kitSpecifiers: [{ kitName: args[0], checklists: [] }] }));
      mockRunCommand.mockResolvedValue(0);

      const { exitCode } = await route(args);

      expect(exitCode).toBe(0);
      expect(mockParseRunArgs).toHaveBeenCalledWith(args);
    });

    it('runs a bare word carrying a checklist filter as a kit', async () => {
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ kitSpecifiers: [{ kitName: 'lis', checklists: ['t'] }] }));
      mockRunCommand.mockResolvedValue(0);

      const { exitCode } = await route(['lis:t']);

      expect(exitCode).toBe(0);
      expect(mockParseRunArgs).toHaveBeenCalledWith(['lis:t']);
    });

    it('still suggests a command when a source flag follows the -- terminator', async () => {
      const { exitCode, stderr } = await route(['lst', '--', '--from']);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("Did you mean 'rdy list'?");
    });

    it('does not suggest after an explicit run subcommand', async () => {
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ kitSpecifiers: [{ kitName: 'lst', checklists: [] }] }));
      mockRunCommand.mockResolvedValue(0);

      const { exitCode } = await route(['run', 'lst']);

      expect(exitCode).toBe(0);
      expect(mockParseRunArgs).toHaveBeenCalledWith(['lst']);
    });

    it('does not suggest when input matches a subcommand exactly', async () => {
      mockParseRunArgs.mockReturnValue(parsedRunArgs());
      mockRunCommand.mockResolvedValue(0);

      // 'run' is handled before typo detection, so this verifies
      // the explicit subcommand path
      const { exitCode } = await route(['run']);

      expect(exitCode).toBe(0);
    });
  });
});

// region | Helpers

/** Builds a `parseRunArgs` return value with the no-flags defaults. */
function parsedRunArgs(overrides?: Record<string, unknown>) {
  return {
    kitSpecifiers: [],
    checklists: undefined,
    filePath: undefined,
    fromValue: undefined,
    urlValue: undefined,
    jit: false,
    internal: false,
    json: false,
    ...overrides,
  };
}

/** Runs the CLI over the given arguments, returning its exit code alongside everything it wrote. */
async function route(args: string[]) {
  using io = captureStdio();

  const exitCode = await routeCommand(args);

  return { exitCode, stdout: io.stdout, stderr: io.stderr, stderrChunks: io.stderrChunks };
}

// endregion | Helpers
