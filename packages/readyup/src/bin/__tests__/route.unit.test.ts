import { createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, beforeEach, describe, expect, it as baseIt, vi } from 'vitest';

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
import { DOCS_POINTER } from '../../help/helpText.ts';
import { routeCommand } from '../route.ts';
import { parsedRunArgs } from '../test-utils/parsedRunArgs.ts';
import { routeCli } from '../test-utils/routeCli.ts';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-route-' })),
);

describe(routeCommand, () => {
  beforeEach(() => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
      internal: { dir: '.', infix: undefined },
      sources: [],
    });
    mockResolveKitSources.mockReturnValue({
      entries: [{ name: 'default', source: { path: '.readyup/kits/default.js' }, checklists: [] }],
      unrunSources: [],
    });
  });

  afterEach(() => {
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
    const { exitCode, stdout } = await routeCli([]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage: rdy');
  });

  it('shows help and returns 0 for --help', async () => {
    const { exitCode, stdout } = await routeCli(['--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage: rdy');
  });

  it('shows help and returns 0 for -h', async () => {
    const { exitCode } = await routeCli(['-h']);

    expect(exitCode).toBe(0);
  });

  it('prints version and returns 0 for --version', async () => {
    const { exitCode, stdout } = await routeCli(['--version']);

    expect(exitCode).toBe(0);
    expect(stdout).toBe('1.2.3\n');
  });

  it('prints version and returns 0 for -V', async () => {
    const { exitCode, stdout } = await routeCli(['-V']);

    expect(exitCode).toBe(0);
    expect(stdout).toBe('1.2.3\n');
  });

  it('includes run options in top-level help', async () => {
    const { stdout } = await routeCli(['--help']);

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
    const { stdout } = await routeCli(args);

    for (const short of ['-J', '-F', '-R', '-i', '-u', '-j']) {
      expect(stdout).not.toContain(`, ${short}`);
    }
  });

  it('marks run as the default command in top-level help', async () => {
    const { stdout } = await routeCli(['--help']);

    expect(stdout).toContain('(default)');
  });

  it('points at per-command help from top-level help', async () => {
    const { stdout } = await routeCli(['--help']);

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
    const { stdout } = await routeCli(args);

    expect(stdout).toContain(DOCS_POINTER);
  });

  it('points at the documented package homepage', () => {
    expect(DOCS_POINTER).toContain(packageJson.homepage);
  });

  it('points at the installed docs directory, the authoring skill, and how to install it', () => {
    expect(DOCS_POINTER).toContain('node_modules/readyup/docs/');
    expect(DOCS_POINTER).toContain('consult-readyup-kits');
    expect(DOCS_POINTER).toContain("'rdy help authoring'");
  });

  it.each([
    { label: 'exit codes', text: 'Exit codes:' },
    { label: 'schema evolution', text: 'schemaVersion' },
  ])('leaves $label to the documentation rather than top-level help', async ({ text }) => {
    const { stdout } = await routeCli(['--help']);

    expect(stdout).not.toContain(text);
  });

  it.each([
    { label: 'top-level', args: ['--help'] },
    { label: 'run', args: ['run', '--help'] },
    { label: 'list', args: ['list', '--help'] },
  ])('shows examples in $label help', async ({ args }) => {
    const { stdout } = await routeCli(args);

    expect(stdout).toContain('Examples:');
  });

  it.each([
    { label: 'top-level', args: ['--help'] },
    { label: 'run', args: ['run', '--help'] },
    { label: 'list', args: ['list', '--help'] },
  ])('lists --no-cache in $label help', async ({ args }) => {
    const { stdout } = await routeCli(args);

    expect(stdout).toContain('--no-cache');
  });

  it.each([
    { label: 'top-level', args: ['--help'] },
    { label: 'run', args: ['run', '--help'] },
  ])('lists --diagnose in $label help', async ({ args }) => {
    const { stdout } = await routeCli(args);

    expect(stdout).toContain('--diagnose');
  });

  it('explains how to escape a positional starting with a dash in run help', async () => {
    const { stdout } = await routeCli(['run', '--help']);

    expect(stdout).toContain('rdy run -- "--odd-kit-name"');
  });

  it('shows run help and returns 0 for run --help', async () => {
    const { exitCode, stdout } = await routeCli(['run', '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage: rdy run');
  });

  it('includes --json in run help text', async () => {
    const { stdout } = await routeCli(['run', '--help']);

    expect(stdout).toContain('--json');
  });

  it('lists compile in top-level help', async () => {
    const { stdout } = await routeCli([]);

    expect(stdout).toContain('compile');
  });

  it('lists list in top-level help', async () => {
    const { stdout } = await routeCli([]);

    expect(stdout).toContain('list');
  });

  describe('error envelope and stdout purity', () => {
    it('emits the error envelope on stdout and leaves stderr empty for a usage error under --json', async () => {
      mockParseRunArgs.mockImplementation(() => {
        throw usageError("Unknown option '--bogus'");
      });

      const { exitCode, stdout, stderr } = await routeCli(['--json', '--bogus']);

      expect(exitCode).toBe(2);
      expect(JSON.parse(stdout)).toStrictEqual({
        schemaVersion: 1,
        error: { code: 'usage', message: "Unknown option '--bogus'" },
      });
      expect(stderr).toBe('');
    });

    it('reports a hint as its own envelope field, leaving the message unchanged', async () => {
      mockParseRunArgs.mockImplementation(() => {
        throw usageError('nothing found', { hint: 'Set GITHUB_TOKEN.' });
      });

      const { exitCode, stdout } = await routeCli(['--json', '--bogus']);

      expect(exitCode).toBe(2);
      expect(JSON.parse(stdout)).toStrictEqual({
        schemaVersion: 1,
        error: { code: 'usage', message: 'nothing found', hint: 'Set GITHUB_TOKEN.' },
      });
    });

    it('classifies a config-load failure as a config error in the envelope', async () => {
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ json: true }));
      mockLoadConfig.mockRejectedValue(new Error('bad config'));

      const { exitCode, stdout } = await routeCli(['run', '--json']);

      expect(exitCode).toBe(2);
      expect(JSON.parse(stdout)).toMatchObject({ error: { code: 'config', message: 'bad config' } });
    });

    it('classifies an undiagnosed failure as an internal error in the envelope', async () => {
      mockParseRunArgs.mockImplementation(() => {
        throw new Error('something unexpected');
      });

      const { exitCode, stdout } = await routeCli(['--json']);

      expect(exitCode).toBe(2);
      expect(JSON.parse(stdout)).toMatchObject({ error: { code: 'internal', message: 'something unexpected' } });
    });

    it('emits an unknown-command error as an envelope rather than prose under --json', async () => {
      const { exitCode, stdout, stderr } = await routeCli(['compil', '--json']);

      expect(exitCode).toBe(2);
      expect(JSON.parse(stdout)).toMatchObject({ error: { code: 'usage' } });
      expect(stderr).toBe('');
    });

    it('diverts help text to stderr under --json so that stdout stays free of prose', async () => {
      const { exitCode, stdout, stderr } = await routeCli(['--help', '--json']);

      expect(exitCode).toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toContain('Usage: rdy');
    });

    it('stops the --json scan at the `--` terminator', async () => {
      mockParseRunArgs.mockImplementation(() => {
        throw usageError('nope');
      });

      const { exitCode, stdout, stderr } = await routeCli(['run', '--', '--json']);

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
        checklistChecks: undefined,
        filePath: 'foo.ts',
        fromValue: undefined,
        urlValue: undefined,
        jit: false,
        internal: false,
        json: false,
      });
      mockRunCommand.mockResolvedValue(0);

      const { exitCode } = await routeCli(['--file', 'foo.ts']);

      expect(mockParseRunArgs).toHaveBeenCalledWith(['--file', 'foo.ts']);
      expect(exitCode).toBe(0);
    });

    it('routes positional args to run as kit specifiers', async ({ temp }) => {
      temp.write('.readyup/kits/onboarding.js', 'export const checklists = [];');
      using _cwd = pointCwdAt(temp.dir);
      mockParseRunArgs.mockReturnValue({
        kitSpecifiers: [{ kitName: 'onboarding', checklists: [] }],
        checklists: undefined,
        checklistChecks: undefined,
        filePath: undefined,
        fromValue: undefined,
        urlValue: undefined,
        jit: false,
        internal: false,
        json: false,
      });
      mockRunCommand.mockResolvedValue(0);

      const { exitCode } = await routeCli(['onboarding']);

      expect(mockParseRunArgs).toHaveBeenCalledWith(['onboarding']);
      expect(exitCode).toBe(0);
    });
  });
});
