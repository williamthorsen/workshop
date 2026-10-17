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

  describe('unknown-word detection', () => {
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
      const { exitCode, stderr } = await routeCli([input]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain(`Did you mean 'rdy ${expected}'?`);
    });

    it('reports a word that is neither a command nor a kit, pointing at rdy --help', async () => {
      const { exitCode, stderr } = await routeCli(['onboarding']);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("Error: 'onboarding' is neither a command nor a kit.");
      expect(stderr).toContain("Run 'rdy --help' to list commands, or 'rdy list' to list kits.");
      expect(stderr).not.toContain('Did you mean');
      expect(mockRunCommand).not.toHaveBeenCalled();
    });

    it('reports a word that is neither a command nor a kit as a usage error in JSON', async () => {
      const { exitCode, stdout } = await routeCli(['onboarding', '--json']);

      expect(exitCode).toBe(2);
      expect(JSON.parse(stdout)).toStrictEqual({
        schemaVersion: 1,
        error: {
          code: 'usage',
          message: "'onboarding' is neither a command nor a kit.",
          hint: "Run 'rdy --help' to list commands, or 'rdy list' to list kits.",
        },
      });
    });

    it('runs a word that no command is close to when a kit by that name exists', async ({ temp }) => {
      temp.write('.readyup/kits/onboarding.js', 'export const checklists = [];');
      using _cwd = pointCwdAt(temp.dir);
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ kitSpecifiers: [{ kitName: 'onboarding', checklists: [] }] }));
      mockRunCommand.mockResolvedValue(0);

      const { exitCode, stderr } = await routeCli(['onboarding']);

      expect(exitCode).toBe(0);
      expect(stderr).toBe('');
    });

    it('loads the config once for a bare word that names a kit', async ({ temp }) => {
      temp.write('.readyup/kits/onboarding.js', 'export const checklists = [];');
      using _cwd = pointCwdAt(temp.dir);
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ kitSpecifiers: [{ kitName: 'onboarding', checklists: [] }] }));
      mockRunCommand.mockResolvedValue(0);

      await routeCli(['onboarding']);

      expect(mockLoadConfig).toHaveBeenCalledTimes(1);
    });

    it('reports a missing kit as a kit rather than an unknown word after an explicit run subcommand', async () => {
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ kitSpecifiers: [{ kitName: 'onboarding', checklists: [] }] }));
      mockRunCommand.mockResolvedValue(2);

      const { stderr } = await routeCli(['run', 'onboarding']);

      expect(stderr).not.toContain('neither a command nor a kit');
      expect(mockRunCommand).toHaveBeenCalled();
    });

    it('runs a bare word as a kit when a kit by that name exists', async ({ temp }) => {
      temp.write('.readyup/kits/lst.js', 'export const checklists = [];');
      using _cwd = pointCwdAt(temp.dir);
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ kitSpecifiers: [{ kitName: 'lst', checklists: [] }] }));
      mockRunCommand.mockResolvedValue(0);

      const { exitCode } = await routeCli(['lst']);

      expect(exitCode).toBe(0);
      expect(mockParseRunArgs).toHaveBeenCalledWith(['lst']);
    });

    it('runs a bare word as a kit when the configured output directory contains its bundle', async ({ temp }) => {
      temp.write('dist/kits/lst.js', 'export const checklists = [];');
      using _cwd = pointCwdAt(temp.dir);
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: 'kits/src', outDir: 'dist/kits', include: undefined, exclude: [] },
        internal: { dir: '.', infix: undefined },
        sources: [],
      });
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ kitSpecifiers: [{ kitName: 'lst', checklists: [] }] }));
      mockRunCommand.mockResolvedValue(0);

      const { exitCode } = await routeCli(['lst']);

      expect(exitCode).toBe(0);
    });

    it('runs a bare word as a kit when the configured source directory contains its source', async ({ temp }) => {
      temp.write('kits/src/lst.ts', 'export const checklists = [];');
      using _cwd = pointCwdAt(temp.dir);
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: 'kits/src', outDir: 'dist/kits', include: undefined, exclude: [] },
        internal: { dir: '.', infix: undefined },
        sources: [],
      });
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ kitSpecifiers: [{ kitName: 'lst', checklists: [] }] }));
      mockRunCommand.mockResolvedValue(0);

      const { exitCode } = await routeCli(['lst']);

      expect(exitCode).toBe(0);
    });

    it('reads the directories of the config that --config names, in either flag form', async ({ temp }) => {
      temp.write('kits/src/lst.ts', 'export const checklists = [];');
      using _cwd = pointCwdAt(temp.dir);
      // Only the override resolves to a directory containing the kit, so a probe reading the lookup
      // chain reports a typo instead.
      mockLoadConfig.mockImplementation((options?: { overridePath?: string }) =>
        Promise.resolve({
          compile: {
            srcDir: options?.overridePath === 'other.config.ts' ? 'kits/src' : 'unread',
            outDir: 'dist/kits',
            include: undefined,
            exclude: [],
          },
          internal: { dir: '.', infix: undefined },
          sources: [],
        }),
      );
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ kitSpecifiers: [{ kitName: 'lst', checklists: [] }] }));
      mockRunCommand.mockResolvedValue(0);

      const separate = await routeCli(['lst', '--config', 'other.config.ts']);
      const inline = await routeCli(['lst', '--config=other.config.ts']);

      expect([separate.exitCode, inline.exitCode]).toStrictEqual([0, 0]);
      expect(mockLoadConfig).toHaveBeenCalledWith({ overridePath: 'other.config.ts' });
    });

    it('reports a config that cannot be evaluated rather than suggesting a command', async () => {
      mockLoadConfig.mockRejectedValue(new Error('bad config'));

      const { exitCode, stderr } = await routeCli(['lst']);

      expect(exitCode).toBe(2);
      expect(stderr).toContain('bad config');
      expect(stderr).not.toContain('Did you mean');
    });

    it('suggests a command when only the convention directory contains the kit and the config moved', async ({
      temp,
    }) => {
      temp.write('.readyup/kits/lst.js', 'export const checklists = [];');
      using _cwd = pointCwdAt(temp.dir);
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: 'kits/src', outDir: 'dist/kits', include: undefined, exclude: [] },
        internal: { dir: '.', infix: undefined },
        sources: [],
      });

      const { exitCode, stderr } = await routeCli(['lst']);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("Did you mean 'rdy list'?");
    });

    it.each([
      ['--from', ['lst', '--from', 'global']],
      ['--from with an inline value', ['lst', '--from=global']],
      ['--file', ['lst', '--file', 'kit.js']],
      ['--url', ['lst', '--url', 'https://example.test/kit.js']],
      ['--internal', ['runn', '--internal']],
      ['--sources', ['lst', '--sources']],
      ['--sources and the word is near no command', ['onboarding', '--sources']],
    ])('runs the bare word as a kit when %s names its source', async (_label, args) => {
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ kitSpecifiers: [{ kitName: args[0], checklists: [] }] }));
      mockRunCommand.mockResolvedValue(0);

      const { exitCode } = await routeCli(args);

      expect(exitCode).toBe(0);
      expect(mockParseRunArgs).toHaveBeenCalledWith(args);
    });

    it('runs a bare word with a checklist filter as a kit', async () => {
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ kitSpecifiers: [{ kitName: 'lis', checklists: ['t'] }] }));
      mockRunCommand.mockResolvedValue(0);

      const { exitCode } = await routeCli(['lis:t']);

      expect(exitCode).toBe(0);
      expect(mockParseRunArgs).toHaveBeenCalledWith(['lis:t']);
    });

    it('still suggests a command when a source flag follows the -- terminator', async () => {
      const { exitCode, stderr } = await routeCli(['lst', '--', '--from']);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("Did you mean 'rdy list'?");
    });

    it('does not suggest after an explicit run subcommand', async () => {
      mockParseRunArgs.mockReturnValue(parsedRunArgs({ kitSpecifiers: [{ kitName: 'lst', checklists: [] }] }));
      mockRunCommand.mockResolvedValue(0);

      const { exitCode } = await routeCli(['run', 'lst']);

      expect(exitCode).toBe(0);
      expect(mockParseRunArgs).toHaveBeenCalledWith(['lst']);
    });

    it('does not suggest when input matches a subcommand exactly', async () => {
      mockParseRunArgs.mockReturnValue(parsedRunArgs());
      mockRunCommand.mockResolvedValue(0);

      // 'run' is handled before typo detection, so this verifies
      // the explicit subcommand path
      const { exitCode } = await routeCli(['run']);

      expect(exitCode).toBe(0);
    });
  });
});
