import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

const mockRunCommand = vi.hoisted(() => vi.fn());
const mockInitCommand = vi.hoisted(() => vi.fn());
const mockCompileCommand = vi.hoisted(() => vi.fn());
const mockListCommand = vi.hoisted(() => vi.fn());
const mockParseRunArgs = vi.hoisted(() => vi.fn());
const mockResolveKitSources = vi.hoisted(() => vi.fn());
const mockLoadConfig = vi.hoisted(() => vi.fn());

vi.mock('../src/cli.ts', () => ({
  parseRunArgs: mockParseRunArgs,
  resolveKitSources: mockResolveKitSources,
  runCommand: mockRunCommand,
}));

vi.mock('../src/loadConfig.ts', () => ({
  loadConfig: mockLoadConfig,
}));

vi.mock('../src/compile/compileCommand.ts', () => ({
  compileCommand: mockCompileCommand,
}));

vi.mock('../src/init/initCommand.ts', () => ({
  initCommand: mockInitCommand,
}));

vi.mock('../src/list/listCommand.ts', () => ({
  listCommand: mockListCommand,
}));

vi.mock('../src/version.ts', () => ({
  VERSION: '1.2.3',
}));

import { routeCommand } from '../src/bin/route.ts';
import { usageError } from '../src/errors.ts';

/** Scratch project root for the tests that need a kit file on disk. */
const TYPO_TEST_DIR = join(import.meta.dirname, '../.test-tmp-route');

describe(routeCommand, () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
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
    const exitCode = await routeCommand([]);

    expect(exitCode).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Usage: rdy');
  });

  it('shows help and returns 0 for --help', async () => {
    const exitCode = await routeCommand(['--help']);

    expect(exitCode).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Usage: rdy');
  });

  it('shows help and returns 0 for -h', async () => {
    const exitCode = await routeCommand(['-h']);

    expect(exitCode).toBe(0);
  });

  it('prints version and returns 0 for --version', async () => {
    const exitCode = await routeCommand(['--version']);

    expect(exitCode).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith('1.2.3\n');
  });

  it('prints version and returns 0 for -V', async () => {
    const exitCode = await routeCommand(['-V']);

    expect(exitCode).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith('1.2.3\n');
  });

  it('includes run options in top-level help', async () => {
    await routeCommand(['--help']);

    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('--from');
    expect(output).toContain('--file, -f');
    expect(output).toContain('--url');
    expect(output).toContain('--jit');
    expect(output).toContain('--internal');
    expect(output).toContain('--checklists, -c');
    expect(output).toContain('--json');
    expect(output).toContain('--version, -V');
  });

  it.each([
    { label: 'top-level', args: ['--help'] },
    { label: 'run', args: ['run', '--help'] },
    { label: 'init', args: ['init', '--help'] },
  ])('names no retired short flag in $label help', async ({ args }) => {
    await routeCommand(args);

    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    for (const short of ['-J', '-F', '-R', '-i', '-u', '-j']) {
      expect(output).not.toContain(`, ${short}`);
    }
  });

  it('marks run as the default command in top-level help', async () => {
    await routeCommand(['--help']);

    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('(default)');
  });

  it('shows run help and returns 0 for run --help', async () => {
    const exitCode = await routeCommand(['run', '--help']);

    expect(exitCode).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Usage: rdy run');
  });

  it('shows init help and returns 0 for init --help', async () => {
    const exitCode = await routeCommand(['init', '--help']);

    expect(exitCode).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Usage: rdy init');
  });

  it('shows init help and returns 0 for init -h', async () => {
    const exitCode = await routeCommand(['init', '-h']);

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

    const exitCode = await routeCommand(['run', 'deploy']);

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

    const exitCode = await routeCommand(['run', '--jit']);

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

    const exitCode = await routeCommand(['run', '--json']);

    expect(mockRunCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        json: true,
      }),
      false,
    );
    expect(exitCode).toBe(0);
  });

  it('includes --json in run help text', async () => {
    await routeCommand(['run', '--help']);

    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('--json');
  });

  it('returns 2 and writes to stderr when parseRunArgs throws', async () => {
    mockParseRunArgs.mockImplementation(() => {
      throw new Error("unknown flag '--bad'");
    });

    const exitCode = await routeCommand(['run', '--bad']);

    expect(exitCode).toBe(2);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("unknown flag '--bad'"));
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

    const exitCode = await routeCommand(['run', '--file', 'path.ts']);

    expect(exitCode).toBe(2);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('resolution failed'));
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

    const exitCode = await routeCommand(['run']);

    expect(exitCode).toBe(2);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('bad config'));
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

    await routeCommand(['run', '--file', 'kit.ts']);

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

    await routeCommand(['run', '--from', 'github:org/repo', 'deploy']);

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

    await routeCommand(['run', '--url', 'https://example.com/kit.js']);

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

    await routeCommand(['run']);

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

    await routeCommand(['run', '--internal']);

    expect(mockLoadConfig).toHaveBeenCalled();
  });

  it('shows compile help and returns 0 for compile --help', async () => {
    const exitCode = await routeCommand(['compile', '--help']);

    expect(exitCode).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Usage: rdy compile');
    expect(output).toContain('If no file is given');
  });

  it('shows compile help and returns 0 for compile -h', async () => {
    const exitCode = await routeCommand(['compile', '-h']);

    expect(exitCode).toBe(0);
  });

  it('delegates to compileCommand for compile subcommand', async () => {
    mockCompileCommand.mockResolvedValue(0);

    const exitCode = await routeCommand(['compile', 'input.ts']);

    expect(mockCompileCommand).toHaveBeenCalledWith(['input.ts']);
    expect(exitCode).toBe(0);
  });

  it('passes --output flag through to compileCommand', async () => {
    mockCompileCommand.mockResolvedValue(0);

    const exitCode = await routeCommand(['compile', 'input.ts', '--output', 'out.js']);

    expect(mockCompileCommand).toHaveBeenCalledWith(['input.ts', '--output', 'out.js']);
    expect(exitCode).toBe(0);
  });

  it('lists compile in top-level help', async () => {
    await routeCommand([]);

    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('compile');
  });

  it('delegates to initCommand for init subcommand', async () => {
    mockInitCommand.mockReturnValue(0);

    const exitCode = await routeCommand(['init']);

    expect(mockInitCommand).toHaveBeenCalledWith({ dryRun: false, force: false });
    expect(exitCode).toBe(0);
  });

  it('passes --dry-run and --force flags to initCommand', async () => {
    mockInitCommand.mockReturnValue(0);

    const exitCode = await routeCommand(['init', '--dry-run', '--force']);

    expect(mockInitCommand).toHaveBeenCalledWith({ dryRun: true, force: true });
    expect(exitCode).toBe(0);
  });

  it('passes the -n short flag to initCommand', async () => {
    mockInitCommand.mockReturnValue(0);

    const exitCode = await routeCommand(['init', '-n']);

    expect(mockInitCommand).toHaveBeenCalledWith({ dryRun: true, force: false });
    expect(exitCode).toBe(0);
  });

  it('rejects the retired init -f short flag', async () => {
    const exitCode = await routeCommand(['init', '-f']);

    expect(exitCode).toBe(2);
    expect(mockInitCommand).not.toHaveBeenCalled();
  });

  it('returns 2 for unknown init flags', async () => {
    const exitCode = await routeCommand(['init', '--unknown']);

    expect(exitCode).toBe(2);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown option '--unknown'"));
  });

  it('shows list help and returns 0 for list --help', async () => {
    const exitCode = await routeCommand(['list', '--help']);

    expect(exitCode).toBe(0);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Usage: rdy list');
  });

  it('shows list help and returns 0 for list -h', async () => {
    const exitCode = await routeCommand(['list', '-h']);

    expect(exitCode).toBe(0);
  });

  it('delegates to listCommand for list subcommand', async () => {
    mockListCommand.mockResolvedValue(0);

    const exitCode = await routeCommand(['list']);

    expect(mockListCommand).toHaveBeenCalledWith([]);
    expect(exitCode).toBe(0);
  });

  it('passes --from flag through to listCommand', async () => {
    mockListCommand.mockResolvedValue(0);

    const exitCode = await routeCommand(['list', '--from', '.']);

    expect(mockListCommand).toHaveBeenCalledWith(['--from', '.']);
    expect(exitCode).toBe(0);
  });

  it('lists list in top-level help', async () => {
    await routeCommand([]);

    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('list');
  });

  describe('error envelope and stdout purity', () => {
    /** Collects everything written to stdout during the call, parsed as a single JSON document. */
    function parseStdout(): unknown {
      const written = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      return JSON.parse(written);
    }

    it('emits the error envelope on stdout and leaves stderr empty for a usage error under --json', async () => {
      mockParseRunArgs.mockImplementation(() => {
        throw usageError("Unknown option '--bogus'");
      });

      const exitCode = await routeCommand(['--json', '--bogus']);

      expect(exitCode).toBe(2);
      expect(parseStdout()).toStrictEqual({
        schemaVersion: 1,
        error: { code: 'usage', message: "Unknown option '--bogus'" },
      });
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('classifies a config-load failure as a config error in the envelope', async () => {
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ json: true }));
      mockLoadConfig.mockRejectedValue(new Error('bad config'));

      const exitCode = await routeCommand(['run', '--json']);

      expect(exitCode).toBe(2);
      expect(parseStdout()).toMatchObject({ error: { code: 'config', message: 'bad config' } });
    });

    it('classifies an undiagnosed failure as an internal error in the envelope', async () => {
      mockParseRunArgs.mockImplementation(() => {
        throw new Error('something unexpected');
      });

      const exitCode = await routeCommand(['--json']);

      expect(exitCode).toBe(2);
      expect(parseStdout()).toMatchObject({ error: { code: 'internal', message: 'something unexpected' } });
    });

    it('emits an unknown-command error as an envelope rather than prose under --json', async () => {
      const exitCode = await routeCommand(['compil', '--json']);

      expect(exitCode).toBe(2);
      expect(parseStdout()).toMatchObject({ error: { code: 'usage' } });
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('diverts help text to stderr under --json so stdout stays free of prose', async () => {
      const exitCode = await routeCommand(['--help', '--json']);

      expect(exitCode).toBe(0);
      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: rdy'));
    });

    it('stops the --json scan at the `--` terminator', async () => {
      mockParseRunArgs.mockImplementation(() => {
        throw usageError('nope');
      });

      const exitCode = await routeCommand(['run', '--', '--json']);

      expect(exitCode).toBe(2);
      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('nope'));
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

      const exitCode = await routeCommand(['--file', 'foo.ts']);

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

      const exitCode = await routeCommand(['onboarding']);

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
      const exitCode = await routeCommand([input]);

      expect(exitCode).toBe(2);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining(`Did you mean 'rdy ${expected}'?`));
    });

    it('does not suggest for a word no command is close to', async () => {
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ kitSpecifiers: [{ kitName: 'onboarding', checklists: [] }] }));
      mockRunCommand.mockResolvedValue(0);

      const exitCode = await routeCommand(['onboarding']);

      expect(exitCode).toBe(0);
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('runs a bare word as a kit when a kit by that name exists', async () => {
      mkdirSync(join(TYPO_TEST_DIR, '.readyup/kits'), { recursive: true });
      writeFileSync(join(TYPO_TEST_DIR, '.readyup/kits/lst.js'), 'export const checklists = [];', 'utf8');
      vi.spyOn(process, 'cwd').mockReturnValue(TYPO_TEST_DIR);
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ kitSpecifiers: [{ kitName: 'lst', checklists: [] }] }));
      mockRunCommand.mockResolvedValue(0);

      const exitCode = await routeCommand(['lst']);

      expect(exitCode).toBe(0);
      expect(mockParseRunArgs).toHaveBeenCalledWith(['lst']);
    });

    it('does not suggest after an explicit run subcommand', async () => {
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ kitSpecifiers: [{ kitName: 'lst', checklists: [] }] }));
      mockRunCommand.mockResolvedValue(0);

      const exitCode = await routeCommand(['run', 'lst']);

      expect(exitCode).toBe(0);
      expect(mockParseRunArgs).toHaveBeenCalledWith(['lst']);
    });

    it('does not suggest when input matches a subcommand exactly', async () => {
      mockParseRunArgs.mockReturnValue(parsedRunArgs());
      mockRunCommand.mockResolvedValue(0);

      // 'run' is handled before typo detection, so this verifies
      // the explicit subcommand path
      const exitCode = await routeCommand(['run']);

      expect(exitCode).toBe(0);
    });
  });
});

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
