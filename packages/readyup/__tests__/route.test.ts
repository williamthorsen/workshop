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

describe(routeCommand, () => {
  let infoSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
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
    const output = infoSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Usage: rdy');
  });

  it('shows help and returns 0 for --help', async () => {
    const exitCode = await routeCommand(['--help']);

    expect(exitCode).toBe(0);
    const output = infoSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Usage: rdy');
  });

  it('shows help and returns 0 for -h', async () => {
    const exitCode = await routeCommand(['-h']);

    expect(exitCode).toBe(0);
  });

  it('prints version and returns 0 for --version', async () => {
    const exitCode = await routeCommand(['--version']);

    expect(exitCode).toBe(0);
    expect(infoSpy).toHaveBeenCalledWith('1.2.3');
  });

  it('prints version and returns 0 for -V', async () => {
    const exitCode = await routeCommand(['-V']);

    expect(exitCode).toBe(0);
    expect(infoSpy).toHaveBeenCalledWith('1.2.3');
  });

  it('includes run options in top-level help', async () => {
    await routeCommand(['--help']);

    const output = infoSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('--from');
    expect(output).toContain('--file, -f');
    expect(output).toContain('--url, -u');
    expect(output).toContain('--jit, -J');
    expect(output).toContain('--internal, -i');
    expect(output).toContain('--checklists, -c');
    expect(output).toContain('--json, -j');
    expect(output).toContain('--version, -V');
  });

  it('marks run as the default command in top-level help', async () => {
    await routeCommand(['--help']);

    const output = infoSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('(default)');
  });

  it('shows run help and returns 0 for run --help', async () => {
    const exitCode = await routeCommand(['run', '--help']);

    expect(exitCode).toBe(0);
    const output = infoSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Usage: rdy run');
  });

  it('shows init help and returns 0 for init --help', async () => {
    const exitCode = await routeCommand(['init', '--help']);

    expect(exitCode).toBe(0);
    const output = infoSpy.mock.calls.map((c) => String(c[0])).join('');
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

    const output = infoSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('--json');
  });

  it('returns 1 and writes to stderr when parseRunArgs throws', async () => {
    mockParseRunArgs.mockImplementation(() => {
      throw new Error("unknown flag '--bad'");
    });

    const exitCode = await routeCommand(['run', '--bad']);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("unknown flag '--bad'"));
  });

  it('returns 1 and writes to stderr when resolveKitSources throws', async () => {
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

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('resolution failed'));
  });

  it('returns 1 and writes to stderr when loadConfig rejects', async () => {
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

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('bad config'));
  });

  it('shows compile help and returns 0 for compile --help', async () => {
    const exitCode = await routeCommand(['compile', '--help']);

    expect(exitCode).toBe(0);
    const output = infoSpy.mock.calls.map((c) => String(c[0])).join('');
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

    const output = infoSpy.mock.calls.map((c) => String(c[0])).join('');
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

  it('passes -n and -f short flags to initCommand', async () => {
    mockInitCommand.mockReturnValue(0);

    const exitCode = await routeCommand(['init', '-n', '-f']);

    expect(mockInitCommand).toHaveBeenCalledWith({ dryRun: true, force: true });
    expect(exitCode).toBe(0);
  });

  it('returns 1 for unknown init flags', async () => {
    const exitCode = await routeCommand(['init', '--unknown']);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown option: --unknown'));
  });

  it('shows list help and returns 0 for list --help', async () => {
    const exitCode = await routeCommand(['list', '--help']);

    expect(exitCode).toBe(0);
    const output = infoSpy.mock.calls.map((c) => String(c[0])).join('');
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

    const output = infoSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('list');
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
      ['compil', 'compile'],
      ['compi', 'compile'],
      ['comp', 'compile'],
      ['ini', 'init'],
      ['lis', 'list'],
    ])('suggests "%s" -> "%s"', async (input, expected) => {
      const exitCode = await routeCommand([input]);

      expect(exitCode).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining(`Did you mean 'rdy ${expected}'?`));
    });

    it('does not suggest for prefixes shorter than 3 characters', async () => {
      mockParseRunArgs.mockReturnValue({
        kitSpecifiers: [{ kitName: 'co', checklists: [] }],
        checklists: undefined,
        filePath: undefined,
        fromValue: undefined,
        urlValue: undefined,
        jit: false,
        internal: false,
        json: false,
      });
      mockRunCommand.mockResolvedValue(0);

      const exitCode = await routeCommand(['co']);

      expect(exitCode).toBe(0);
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('does not suggest when input matches a subcommand exactly', async () => {
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

      // 'run' is handled before typo detection, so this verifies
      // the explicit subcommand path
      const exitCode = await routeCommand(['run']);

      expect(exitCode).toBe(0);
    });
  });
});
