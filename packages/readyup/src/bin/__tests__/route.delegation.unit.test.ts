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

import { usageError } from '../../errors/RdyError.ts';
import { routeCommand } from '../route.ts';
import { parsedRunArgs } from '../test-utils/parsedRunArgs.ts';
import { routeCli } from '../test-utils/routeCli.ts';

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

  it('shows init help and returns 0 for init --help', async () => {
    const { exitCode, stdout } = await routeCli(['init', '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage: rdy init');
  });

  it('shows init help and returns 0 for init -h', async () => {
    const { exitCode } = await routeCli(['init', '-h']);

    expect(exitCode).toBe(0);
  });

  it('delegates to runCommand for run subcommand', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [{ kitName: 'deploy', checklists: [] }],
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

    const { exitCode } = await routeCli(['run', 'deploy']);

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
      checklistChecks: undefined,
      filePath: undefined,
      fromValue: undefined,
      urlValue: undefined,
      jit: true,
      internal: false,
      json: false,
    });
    mockRunCommand.mockResolvedValue(0);

    const { exitCode } = await routeCli(['run', '--jit']);

    expect(mockRunCommand).toHaveBeenCalledWith(expect.anything(), true);
    expect(exitCode).toBe(0);
  });

  it('passes --json flag through to runCommand', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [],
      checklists: undefined,
      checklistChecks: undefined,
      filePath: undefined,
      fromValue: undefined,
      urlValue: undefined,
      jit: false,
      internal: false,
      json: true,
    });
    mockRunCommand.mockResolvedValue(0);

    const { exitCode } = await routeCli(['run', '--json']);

    expect(mockRunCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        json: true,
      }),
      false,
    );
    expect(exitCode).toBe(0);
  });

  it('passes --diagnose through to runCommand', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [],
      checklists: undefined,
      checklistChecks: undefined,
      filePath: undefined,
      fromValue: undefined,
      urlValue: undefined,
      jit: false,
      internal: false,
      json: false,
      diagnose: true,
    });
    mockRunCommand.mockResolvedValue(0);

    const { exitCode } = await routeCli(['run', '--diagnose']);

    expect(mockRunCommand).toHaveBeenCalledWith(expect.objectContaining({ diagnose: true }), false);
    expect(exitCode).toBe(0);
  });

  it.each([
    { label: 'reloads', noCache: true },
    { label: 'does not reload', noCache: false },
  ])('hands runCommand a remote fetch context that $label when --no-cache is $noCache', async ({ noCache }) => {
    vi.stubEnv('XDG_CACHE_HOME', '/var/cache-home');
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [],
      checklists: undefined,
      checklistChecks: undefined,
      filePath: undefined,
      fromValue: undefined,
      urlValue: undefined,
      jit: false,
      internal: false,
      json: false,
      noCache,
    });
    mockRunCommand.mockResolvedValue(0);

    await routeCli(noCache ? ['run', '--no-cache'] : ['run']);

    expect(mockRunCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        remote: expect.objectContaining({ cache: expect.objectContaining({ reload: noCache }) }),
      }),
      false,
    );
  });

  it('returns 2 and writes to stderr when parseRunArgs throws', async () => {
    mockParseRunArgs.mockImplementation(() => {
      throw new Error("unknown flag '--bad'");
    });

    const { exitCode, stderr } = await routeCli(['run', '--bad']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("unknown flag '--bad'");
  });

  it('returns 2 and writes to stderr when resolveKitSources throws', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [],
      checklists: undefined,
      checklistChecks: undefined,
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

    const { exitCode, stderr } = await routeCli(['run', '--file', 'path.ts']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('resolution failed');
  });

  it('returns 2 and writes to stderr when loadConfig rejects', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [],
      checklists: undefined,
      checklistChecks: undefined,
      filePath: undefined,
      fromValue: undefined,
      urlValue: undefined,
      jit: false,
      internal: false,
      json: false,
    });
    mockLoadConfig.mockRejectedValue(new Error('bad config'));

    const { exitCode, stderr } = await routeCli(['run']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('bad config');
  });

  it('writes a hint on a line of its own, under the style selected by the invocation', async () => {
    mockParseRunArgs.mockImplementation(() => {
      throw usageError('nothing found', { hint: 'Set GITHUB_TOKEN.' });
    });

    const { exitCode, stderrChunks } = await routeCli(['--style', 'plain', 'run', '--bad']);

    expect(exitCode).toBe(2);
    expect(stderrChunks).toStrictEqual(['Error: nothing found\n', 'Hint: Set GITHUB_TOKEN.\n']);
  });

  it('renders the hint through the rich style', async () => {
    mockParseRunArgs.mockImplementation(() => {
      throw usageError('nothing found', { hint: 'Set GITHUB_TOKEN.' });
    });

    const { stderr } = await routeCli(['--style', 'rich', 'run', '--bad']);

    expect(stderr).toContain('👉 Hint: Set GITHUB_TOKEN.\n');
  });

  it('forwards an install hint from a config file whose imports could not be resolved', async () => {
    mockParseRunArgs.mockReturnValue(parsedRunArgs({ json: true }));
    mockLoadConfig.mockRejectedValue(
      Object.assign(new Error("Cannot resolve 'some-lib' while evaluating config.ts."), {
        hint: 'Install it with: pnpm add --save-dev some-lib',
      }),
    );

    const { exitCode, stdout } = await routeCli(['run', '--json']);

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

  it('writes no hint line for a failure that has none', async () => {
    mockParseRunArgs.mockImplementation(() => {
      throw usageError('nothing found');
    });

    const { stderrChunks } = await routeCli(['run', '--bad']);

    expect(stderrChunks).toHaveLength(1);
  });

  // -- Config loading: external sources skip loadConfig --

  it('does not call loadConfig when --file is used', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [],
      checklists: undefined,
      checklistChecks: undefined,
      filePath: 'kit.ts',
      fromValue: undefined,
      urlValue: undefined,
      jit: false,
      internal: false,
      json: false,
    });
    mockResolveKitSources.mockReturnValue({
      entries: [{ name: 'kit.ts', source: { path: 'kit.ts' }, checklists: [] }],
      unrunSources: [],
    });
    mockRunCommand.mockResolvedValue(0);

    await routeCli(['run', '--file', 'kit.ts']);

    expect(mockLoadConfig).not.toHaveBeenCalled();
  });

  it('does not call loadConfig when --from is used', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [{ kitName: 'deploy', checklists: [] }],
      checklists: undefined,
      checklistChecks: undefined,
      filePath: undefined,
      fromValue: 'github:org/repo',
      urlValue: undefined,
      jit: false,
      internal: false,
      json: false,
    });
    mockResolveKitSources.mockReturnValue({
      entries: [{ name: 'deploy', source: { url: 'https://example.com/deploy.js' }, checklists: [] }],
      unrunSources: [],
    });
    mockRunCommand.mockResolvedValue(0);

    await routeCli(['run', '--from', 'github:org/repo', 'deploy']);

    expect(mockLoadConfig).not.toHaveBeenCalled();
  });

  it('does not call loadConfig when --url is used', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [],
      checklists: undefined,
      checklistChecks: undefined,
      filePath: undefined,
      fromValue: undefined,
      urlValue: 'https://example.com/kit.js',
      jit: false,
      internal: false,
      json: false,
    });
    mockResolveKitSources.mockReturnValue({
      entries: [{ name: 'https://example.com/kit.js', source: { url: 'https://example.com/kit.js' }, checklists: [] }],
      unrunSources: [],
    });
    mockRunCommand.mockResolvedValue(0);

    await routeCli(['run', '--url', 'https://example.com/kit.js']);

    expect(mockLoadConfig).not.toHaveBeenCalled();
  });

  it('calls loadConfig for default run (no source flags)', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [],
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

    await routeCli(['run']);

    expect(mockLoadConfig).toHaveBeenCalled();
  });

  it('calls loadConfig when --internal is used', async () => {
    mockParseRunArgs.mockReturnValue({
      kitSpecifiers: [],
      checklists: undefined,
      checklistChecks: undefined,
      filePath: undefined,
      fromValue: undefined,
      urlValue: undefined,
      jit: false,
      internal: true,
      json: false,
    });
    mockRunCommand.mockResolvedValue(0);

    await routeCli(['run', '--internal']);

    expect(mockLoadConfig).toHaveBeenCalled();
  });

  it('passes the path named by --config to loadConfig', async () => {
    mockParseRunArgs.mockReturnValue(parsedRunArgs({ configPath: 'custom/readyup.config.ts' }));
    mockRunCommand.mockResolvedValue(0);

    await routeCli(['run', '--config', 'custom/readyup.config.ts']);

    expect(mockLoadConfig).toHaveBeenCalledWith({ overridePath: 'custom/readyup.config.ts' });
  });

  it('shows compile help and returns 0 for compile --help', async () => {
    const { exitCode, stdout } = await routeCli(['compile', '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage: rdy compile');
    expect(stdout).toContain('If no file is given');
  });

  it('shows compile help and returns 0 for compile -h', async () => {
    const { exitCode } = await routeCli(['compile', '-h']);

    expect(exitCode).toBe(0);
  });

  it('delegates to compileCommand for compile subcommand', async () => {
    mockCompileCommand.mockResolvedValue(0);

    const { exitCode } = await routeCli(['compile', 'input.ts']);

    expect(mockCompileCommand).toHaveBeenCalledWith(['input.ts']);
    expect(exitCode).toBe(0);
  });

  it('passes --output flag through to compileCommand', async () => {
    mockCompileCommand.mockResolvedValue(0);

    const { exitCode } = await routeCli(['compile', 'input.ts', '--output', 'out.js']);

    expect(mockCompileCommand).toHaveBeenCalledWith(['input.ts', '--output', 'out.js']);
    expect(exitCode).toBe(0);
  });

  it('delegates to initCommand for init subcommand', async () => {
    mockInitCommand.mockReturnValue(0);

    const { exitCode } = await routeCli(['init']);

    expect(mockInitCommand).toHaveBeenCalledWith({ dryRun: false, force: false });
    expect(exitCode).toBe(0);
  });

  it('passes --dry-run and --force flags to initCommand', async () => {
    mockInitCommand.mockReturnValue(0);

    const { exitCode } = await routeCli(['init', '--dry-run', '--force']);

    expect(mockInitCommand).toHaveBeenCalledWith({ dryRun: true, force: true });
    expect(exitCode).toBe(0);
  });

  it('passes the -n short flag to initCommand', async () => {
    mockInitCommand.mockReturnValue(0);

    const { exitCode } = await routeCli(['init', '-n']);

    expect(mockInitCommand).toHaveBeenCalledWith({ dryRun: true, force: false });
    expect(exitCode).toBe(0);
  });

  it('rejects the retired init -f short flag', async () => {
    const { exitCode } = await routeCli(['init', '-f']);

    expect(exitCode).toBe(2);
    expect(mockInitCommand).not.toHaveBeenCalled();
  });

  it('returns 2 for init with a positional argument, without scaffolding', async () => {
    const { exitCode, stderr } = await routeCli(['init', 'deploy']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('rdy init does not accept positional arguments.');
    expect(mockInitCommand).not.toHaveBeenCalled();
  });

  it('returns 2 for unknown init flags', async () => {
    const { exitCode, stderr } = await routeCli(['init', '--unknown']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("Unknown option '--unknown'");
  });

  it('shows list help and returns 0 for list --help', async () => {
    const { exitCode, stdout } = await routeCli(['list', '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage: rdy list');
  });

  it('shows list help and returns 0 for list -h', async () => {
    const { exitCode } = await routeCli(['list', '-h']);

    expect(exitCode).toBe(0);
  });

  it('delegates to listCommand for list subcommand', async () => {
    mockListCommand.mockResolvedValue(0);

    const { exitCode } = await routeCli(['list']);

    expect(mockListCommand).toHaveBeenCalledWith([]);
    expect(exitCode).toBe(0);
  });

  it('passes --from flag through to listCommand', async () => {
    mockListCommand.mockResolvedValue(0);

    const { exitCode } = await routeCli(['list', '--from', '.']);

    expect(mockListCommand).toHaveBeenCalledWith(['--from', '.']);
    expect(exitCode).toBe(0);
  });
});
