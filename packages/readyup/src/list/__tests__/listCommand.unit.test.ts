import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoadConfig = vi.hoisted(() => vi.fn());
const mockCollectSourceKitNames = vi.hoisted(() => vi.fn());
const mockEnumerateKits = vi.hoisted(() => vi.fn());
const mockReadManifest = vi.hoisted(() => vi.fn());
const mockExpandConfiguredSource = vi.hoisted(() => vi.fn());
const mockDiscoverKitPackages = vi.hoisted(() => vi.fn());

vi.mock(import('../../sources/expandConfiguredSources.ts'), () => ({
  expandConfiguredSource: mockExpandConfiguredSource,
  expandConfiguredSources: vi.fn(),
}));

vi.mock(import('../../check-utils/discoverKitPackages.ts'), () => ({
  discoverKitPackages: mockDiscoverKitPackages,
}));

vi.mock(import('../../config/loadConfig.ts'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/loadConfig.ts')>();
  return {
    DEFAULT_CONFIG: actual.DEFAULT_CONFIG,
    loadConfig: mockLoadConfig,
  };
});

vi.mock(import('../enumerateKits.ts'), () => ({
  enumerateKits: mockEnumerateKits,
}));

vi.mock(import('../../compile/collectSourceKitNames.ts'), () => ({
  collectSourceKitNames: mockCollectSourceKitNames,
}));

vi.mock(import('../../manifest/readManifest.ts'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../manifest/readManifest.ts')>();
  return {
    ManifestNotFoundError: actual.ManifestNotFoundError,
    readManifest: mockReadManifest,
  };
});

import { ManifestNotFoundError } from '../../manifest/readManifest.ts';
import { listCommand } from '../listCommand.ts';
import { list, listRaising } from '../test-utils/list-runners.ts';

describe(listCommand, () => {
  beforeEach(() => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
      internal: { dir: '.', infix: undefined },
      omittedSources: [],
      sources: [],
    });
    mockCollectSourceKitNames.mockReturnValue([]);
    mockEnumerateKits.mockReturnValue([]);
    mockReadManifest.mockReturnValue({ version: 1, kits: [] });
    mockExpandConfiguredSource.mockResolvedValue([]);
    mockDiscoverKitPackages.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockLoadConfig.mockReset();
    mockCollectSourceKitNames.mockReset();
    mockEnumerateKits.mockReset();
    mockReadManifest.mockReset();
    mockExpandConfiguredSource.mockReset();
    mockDiscoverKitPackages.mockReset();
  });

  describe('from mode', () => {
    it('does not load config when --from is given', async () => {
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });

      const { exitCode } = await list(['--from', '.']);

      expect(exitCode).toBe(0);
      expect(mockLoadConfig).not.toHaveBeenCalled();
    });

    it('reads manifest from a local path and displays compiled kits', async () => {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy' }],
      });

      const { exitCode, stdout } = await list(['--from', '.']);

      expect(exitCode).toBe(0);
      expect(mockReadManifest).toHaveBeenCalledWith(expect.stringContaining('.readyup/manifest.json'));
      expect(stdout).toContain('\u{2500}\u{2500} Compiled');
      expect(stdout).toContain('deploy');
    });

    it('prints empty-consumer message when manifest contains no kits', async () => {
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });

      const { exitCode, stdout } = await list(['--from', '.']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('No compiled kits found');
    });

    it('reports a config error when the manifest is not found at the --from path', async () => {
      mockReadManifest.mockImplementation(() => {
        throw new Error('Manifest file not found: .readyup/manifest.json');
      });

      const { error } = await listRaising(['--from', import.meta.dirname]);

      expect(error.code).toBe('config');
      expect(error.message).toContain('Manifest file not found');
    });
  });

  describe('manifest mode', () => {
    it('displays kits from the manifest file', async () => {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'default', description: 'Health checks' }, { name: 'deploy' }],
      });

      const { exitCode, stdout } = await list(['--manifest', '.readyup/manifest.json']);

      expect(exitCode).toBe(0);
      expect(mockLoadConfig).not.toHaveBeenCalled();
      expect(stdout).toContain('\u{2500}\u{2500} Manifest:');
      expect(stdout).toContain('default');
      expect(stdout).toContain('Health checks');
      expect(stdout).toContain('deploy');
    });

    it('reports a config error when the manifest file cannot be read', async () => {
      mockReadManifest.mockImplementation(() => {
        throw new Error('Manifest file not found: /missing/manifest.json');
      });

      const { error } = await listRaising(['--manifest', '/missing/manifest.json']);

      expect(error.code).toBe('config');
      expect(error.message).toContain('Manifest file not found');
    });

    it('reports a usage error when --from and --manifest are both provided', async () => {
      const { error } = await listRaising(['--from', '.', '--manifest', '.readyup/manifest.json']);

      expect(error.code).toBe('usage');
      expect(error.message).toContain('mutually exclusive');
    });
  });

  describe('--config', () => {
    it.each([
      { mode: 'owner mode', args: [] },
      { mode: 'sources mode', args: ['--sources'] },
    ])('loads the config named by --config in $mode', async ({ args }) => {
      const { exitCode } = await list([...args, '--config', 'custom/readyup.config.ts']);

      expect(exitCode).toBe(0);
      expect(mockLoadConfig).toHaveBeenCalledWith({ overridePath: 'custom/readyup.config.ts' });
    });

    it.each([
      { args: ['--from', '.'], message: '--config and --from are mutually exclusive' },
      { args: ['--manifest', '.readyup/manifest.json'], message: '--config and --manifest are mutually exclusive' },
      { args: ['--recursive'], message: '--recursive and --config are mutually exclusive' },
    ])('reports a usage error for --config with $args.0', async ({ args, message }) => {
      const { error } = await listRaising([...args, '--config', 'custom/readyup.config.ts']);

      expect(error.code).toBe('usage');
      expect(error.message).toBe(message);
    });

    it('reports a usage error when --config is given an empty value', async () => {
      const { error } = await listRaising(['--config=']);

      expect(error.code).toBe('usage');
      expect(error.message).toBe('--config requires a value');
    });
  });

  describe('--json', () => {
    it('distinguishes sources from compiled kits in owner mode', async () => {
      mockCollectSourceKitNames.mockReturnValue(['draft']);
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy', path: 'kits/deploy.js', checklists: ['preflight'] }],
      });

      const { exitCode, stdout } = await list(['--json']);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({
        schemaVersion: 2,
        kits: [
          { name: 'draft', kind: 'internal', internal: false, path: expect.stringContaining('draft.ts') },
          { name: 'deploy', kind: 'compiled', checklists: ['preflight'] },
        ],
      });
    });

    it('includes each row\u{2019}s recorded check names under --checks', async () => {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy', checklists: ['build'], checklistChecks: [{ checklist: 'build', checks: ['A'] }] }],
      });

      const { stdout } = await list(['--json', '--checks']);

      expect(JSON.parse(stdout)).toMatchObject({
        kits: [{ name: 'deploy', checklistChecks: [{ checklist: 'build', checks: ['A'] }] }],
      });
    });

    it('omits recorded check names without --checks', async () => {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy', checklists: ['build'], checklistChecks: [{ checklist: 'build', checks: ['A'] }] }],
      });

      const { stdout } = await list(['--json']);

      expect(stdout).not.toContain('checklistChecks');
    });

    it('marks the internal bucket apart from the sources that share its kind', async () => {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: ['*.ts'], exclude: [] },
        internal: { dir: 'internal', infix: undefined },
        omittedSources: [],
        sources: [],
      });
      mockCollectSourceKitNames.mockReturnValue(['draft']);
      mockEnumerateKits.mockReturnValue(['audit']);

      const { stdout } = await list(['--json']);

      expect(JSON.parse(stdout)).toMatchObject({
        kits: [
          { name: 'draft', kind: 'internal', internal: false },
          { name: 'audit', kind: 'internal', internal: true },
        ],
      });
    });

    it('sends the human view to stderr so that stdout contains one document', async () => {
      mockCollectSourceKitNames.mockReturnValue(['draft']);
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });

      const { stdoutChunks, stderr } = await list(['--json']);

      expect(stdoutChunks).toHaveLength(1);
      expect(stderr).toContain('\u{2500}\u{2500} Uncompiled');
    });

    it('reports an empty kit list rather than the empty-owner prose', async () => {
      mockEnumerateKits.mockReturnValue([]);
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
      });

      const { stdout, stderr } = await list(['--json']);

      expect(JSON.parse(stdout)).toStrictEqual({ schemaVersion: 2, kits: [] });
      expect(stderr).toContain('No kits found.');
    });

    it('reports the manifest fields in manifest mode', async () => {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy', description: 'Deploy checks', readyupVersion: '0.21.2' }],
      });

      const { stdout } = await list(['--manifest', '.readyup/manifest.json', '--json']);

      expect(JSON.parse(stdout)).toStrictEqual({
        schemaVersion: 2,
        kits: [{ name: 'deploy', kind: 'compiled', description: 'Deploy checks', readyupVersion: '0.21.2' }],
      });
    });
  });

  it('reports a usage error for unknown flags', async () => {
    const { error } = await listRaising(['--unknown']);

    expect(error.code).toBe('usage');
    expect(error.message).toContain("Unknown option '--unknown'");
  });

  it('reports a usage error when positional arguments are supplied, before reading anything', async () => {
    const { error } = await listRaising(['deploy']);

    expect(error.code).toBe('usage');
    expect(error.message).toBe('rdy list does not accept positional arguments.');
    expect(mockLoadConfig).not.toHaveBeenCalled();
  });
});
