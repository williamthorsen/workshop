import { captureError, captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoadConfig = vi.hoisted(() => vi.fn());
const mockEnumerateKits = vi.hoisted(() => vi.fn());
const mockReadManifest = vi.hoisted(() => vi.fn());
const mockExpandConfiguredPackages = vi.hoisted(() => vi.fn());
const mockDiscoverKitPackages = vi.hoisted(() => vi.fn());

vi.mock(import('../../installed-packages/expandConfiguredPackages.ts'), () => ({
  expandConfiguredPackages: mockExpandConfiguredPackages,
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

vi.mock(import('../../manifest/readManifest.ts'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../manifest/readManifest.ts')>();
  return {
    ManifestNotFoundError: actual.ManifestNotFoundError,
    readManifest: mockReadManifest,
  };
});

import { RdyError } from '../../errors/RdyError.ts';
import { ManifestNotFoundError } from '../../manifest/readManifest.ts';
import { listCommand } from '../listCommand.ts';

describe(listCommand, () => {
  beforeEach(() => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
      internal: { dir: '.', infix: undefined },
      packages: [],
    });
    mockEnumerateKits.mockReturnValue([]);
    mockReadManifest.mockReturnValue({ version: 1, kits: [] });
    mockExpandConfiguredPackages.mockReturnValue([]);
    mockDiscoverKitPackages.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockLoadConfig.mockReset();
    mockEnumerateKits.mockReset();
    mockReadManifest.mockReset();
    mockExpandConfiguredPackages.mockReset();
    mockDiscoverKitPackages.mockReset();
  });

  describe('owner mode, package sections', () => {
    /** Configures one package and the kit it publishes. */
    function configureOnePackage(): void {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
        internal: { dir: '.', infix: undefined },
        packages: ['@acme/kits'],
      });
      mockExpandConfiguredPackages.mockReturnValue([
        { packageName: '@acme/kits', version: '2.1.0', kitName: 'drift', path: '/pkg/.readyup/kits/drift.js' },
      ]);
    }

    // A project with no kits of its own still runs its dependencies' kits, so reporting "no kits found"
    // and stopping would hide everything `rdy run --packages` would execute.
    it('reports package kits when the project has no manifest and no internal kits of its own', async () => {
      configureOnePackage();
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('.readyup/manifest.json');
      });

      const { exitCode, stdout } = await list([]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Packages');
      expect(stdout).toContain('@acme/kits@2.1.0 / \u{1F4D3} drift');
      expect(stdout).not.toContain('No kits found');
    });

    it('names installed packages that publish kits the config omits', async () => {
      mockDiscoverKitPackages.mockReturnValue(['@acme/kits', 'plain-kit']);
      configureOnePackage();

      const { stdout } = await list([]);

      expect(stdout).toContain('Available');
      expect(stdout).toContain('plain-kit');
      // Already configured, so it belongs under Packages rather than as a candidate to add.
      expect(stdout.slice(stdout.indexOf('Available'))).not.toContain('@acme/kits');
    });

    it('carries package provenance into the JSON payload, apart from the kits it lists', async () => {
      mockDiscoverKitPackages.mockReturnValue(['plain-kit']);
      configureOnePackage();

      const { stdout } = await list(['--json']);

      const payload: unknown = JSON.parse(stdout);
      expect(payload).toMatchObject({
        kits: [{ name: 'drift', kind: 'compiled', origin: { package: '@acme/kits', version: '2.1.0' } }],
        availablePackages: ['plain-kit'],
      });
    });

    // A package reaches the owner listing's rows only by being configured, so the marker is always true
    // here; emitting it regardless is what spares a consumer from knowing which invocation wrote the payload.
    it('marks every package row as configured', async () => {
      configureOnePackage();

      const { stdout } = await list(['--json']);

      const payload: unknown = JSON.parse(stdout);
      expect(payload).toMatchObject({ kits: [{ origin: { configured: true } }] });
    });
  });

  describe('owner mode', () => {
    it('loads config and reads manifest for compiled kits', async () => {
      mockEnumerateKits.mockReturnValue(['default']);
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy' }],
      });

      const { exitCode, stdout } = await list([]);

      expect(exitCode).toBe(0);
      expect(mockLoadConfig).toHaveBeenCalledWith();
      expect(mockReadManifest).toHaveBeenCalledTimes(1);
      // Package discovery is mocked out in this file, so the count covers internal kits alone.
      expect(mockEnumerateKits).toHaveBeenCalledTimes(1);
      expect(mockEnumerateKits).toHaveBeenCalledWith(
        expect.objectContaining({ dir: expect.stringContaining('.readyup/kits'), extension: '.ts' }),
      );
      expect(stdout).toContain('\u{2500}\u{2500} Internal');
      expect(stdout).toContain('\u{2500}\u{2500} Compiled');
    });

    it('uses infix-based extension for internal kits when configured', async () => {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
        internal: { dir: '.', infix: 'int' },
        packages: [],
      });
      mockEnumerateKits.mockReturnValue(['default']);

      const { exitCode } = await list([]);

      expect(exitCode).toBe(0);
      expect(mockEnumerateKits).toHaveBeenCalledWith(expect.objectContaining({ extension: '.int.ts' }));
    });

    it('renders only Internal section when manifest has no compiled kits', async () => {
      mockEnumerateKits.mockReturnValue(['default']);
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });

      const { exitCode, stdout } = await list([]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('\u{2500}\u{2500} Internal');
      expect(stdout).not.toContain('\u{2500}\u{2500} Compiled');
    });

    it('uses custom-outDir style when outDir differs from default', async () => {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: 'src/kits', outDir: 'dist/kits', include: undefined },
        internal: { dir: '.', infix: undefined },
        packages: [],
      });
      mockEnumerateKits.mockReturnValue([]);
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy' }],
      });

      const { exitCode, stdout } = await list([]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('dist/kits/deploy.js');
      expect(stdout).toContain('--file');
    });

    it('prints empty-owner message when no kits exist', async () => {
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
      });

      const { exitCode, stdout } = await list([]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('No kits found.');
    });

    it('warns and lists with default settings when config load fails', async () => {
      mockLoadConfig.mockRejectedValue(new Error('bad config'));
      mockEnumerateKits.mockReturnValue(['default']);

      const { exitCode, stdout, stderr } = await list([]);

      expect(exitCode).toBe(0);
      expect(stderr).toBe('Warning: bad config. Listing with default settings.\n');
      expect(stdout).toContain('default');
    });

    it('renders a hint the config failure carries, on a line of its own', async () => {
      mockLoadConfig.mockRejectedValue(
        Object.assign(new Error("Cannot resolve 'some-lib' while evaluating config.ts."), {
          hint: 'Install it with: pnpm add --save-dev some-lib',
        }),
      );

      const { stderrChunks } = await list([]);

      expect(stderrChunks).toStrictEqual([
        "Warning: Cannot resolve 'some-lib' while evaluating config.ts. Listing with default settings.\n",
        '\u{1F4A1} Hint: Install it with: pnpm add --save-dev some-lib\n',
      ]);
    });

    it('writes no hint line for a config failure that carries none', async () => {
      mockLoadConfig.mockRejectedValue(new Error('bad config'));

      const { stderrChunks } = await list([]);

      expect(stderrChunks).toHaveLength(1);
    });

    it('does not double the period when the config failure already ends in one', async () => {
      mockLoadConfig.mockRejectedValue(new Error('bad config.'));

      const { stderr } = await list([]);

      expect(stderr).toBe('Warning: bad config. Listing with default settings.\n');
    });

    it('reports a config error when enumerateKits throws', async () => {
      const permError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
      mockEnumerateKits.mockImplementation(() => {
        throw permError;
      });

      const { error } = await listRaising([]);

      expect(error.code).toBe('config');
      expect(error.message).toContain('permission denied');
    });

    it('renders Internal section without Compiled when manifest file is missing and internal kits exist', async () => {
      mockEnumerateKits.mockReturnValue(['default']);
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
      });

      const { exitCode, stdout, stderr } = await list([]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('\u{2500}\u{2500} Internal');
      expect(stdout).not.toContain('\u{2500}\u{2500} Compiled');
      expect(stderr).toBe('');
    });

    it.each([
      ['dir', { dir: 'internal', infix: undefined }],
      ['infix', { dir: '.', infix: 'internal' }],
    ])('adds --internal to the internal hint when internal.%s is configured', async (_label, internal) => {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
        internal,
        packages: [],
      });
      mockEnumerateKits.mockReturnValue(['default']);

      const { stdout } = await list([]);

      expect(stdout).toContain('\u{2500}\u{2500} Internal\n   To run: rdy run --jit --internal [<name>]');
    });

    it('leaves --internal out of the internal hint under the default config', async () => {
      mockEnumerateKits.mockReturnValue(['default']);

      const { stdout } = await list([]);

      expect(stdout).toContain('\u{2500}\u{2500} Internal\n   To run: rdy run --jit [<name>]');
    });

    it('writes warning to stderr when manifest read fails with non-missing-file error and internal kits exist', async () => {
      mockEnumerateKits.mockReturnValue(['default']);
      mockReadManifest.mockImplementation(() => {
        throw new Error('Manifest file contains invalid JSON: .readyup/manifest.json');
      });

      const { exitCode, stdout, stderr } = await list([]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('\u{2500}\u{2500} Internal');
      expect(stdout).not.toContain('\u{2500}\u{2500} Compiled');
      expect(stderr).toContain('Warning:');
      expect(stderr).toContain('invalid JSON');
    });
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
        throw new Error('Manifest file not found: /nonexistent/.readyup/manifest.json');
      });

      const { error } = await listRaising(['--from', '/nonexistent']);

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

  describe('--json', () => {
    it('distinguishes internal sources from compiled kits in owner mode', async () => {
      mockEnumerateKits.mockReturnValue(['draft']);
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy', path: 'kits/deploy.js', checklists: ['preflight'] }],
      });

      const { exitCode, stdout } = await list(['--json']);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({
        schemaVersion: 1,
        kits: [
          { name: 'draft', kind: 'internal', path: expect.stringContaining('draft.ts') },
          { name: 'deploy', kind: 'compiled', checklists: ['preflight'] },
        ],
      });
    });

    it('sends the human view to stderr so stdout carries one document', async () => {
      mockEnumerateKits.mockReturnValue(['draft']);
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });

      const { stdoutChunks, stderr } = await list(['--json']);

      expect(stdoutChunks).toHaveLength(1);
      expect(stderr).toContain('\u{2500}\u{2500} Internal');
    });

    it('reports an empty kit list rather than the empty-owner prose', async () => {
      mockEnumerateKits.mockReturnValue([]);
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
      });

      const { stdout, stderr } = await list(['--json']);

      expect(JSON.parse(stdout)).toStrictEqual({ schemaVersion: 1, kits: [] });
      expect(stderr).toContain('No kits found.');
    });

    it('carries the manifest fields in manifest mode', async () => {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy', description: 'Deploy checks', readyupVersion: '0.21.2' }],
      });

      const { stdout } = await list(['--manifest', '.readyup/manifest.json', '--json']);

      expect(JSON.parse(stdout)).toStrictEqual({
        schemaVersion: 1,
        kits: [{ name: 'deploy', kind: 'compiled', description: 'Deploy checks', readyupVersion: '0.21.2' }],
      });
    });
  });

  it('reports a usage error for unknown flags', async () => {
    const { error } = await listRaising(['--unknown']);

    expect(error.code).toBe('usage');
    expect(error.message).toContain("Unknown option '--unknown'");
  });
});

// region | Helpers

/** Runs the command over the given arguments, returning its exit code alongside everything it wrote. */
async function list(args: string[]) {
  using io = captureStdio();

  const exitCode = await listCommand(args);

  return {
    exitCode,
    stdout: io.stdout,
    stdoutChunks: io.stdoutChunks,
    stderr: io.stderr,
    stderrChunks: io.stderrChunks,
  };
}

/** Runs the command expecting it to raise, returning the error alongside everything it wrote. */
async function listRaising(args: string[]) {
  using io = captureStdio();

  const error = await captureError(RdyError, () => listCommand(args));

  return { error, stdout: io.stdout, stderr: io.stderr };
}

// endregion | Helpers
