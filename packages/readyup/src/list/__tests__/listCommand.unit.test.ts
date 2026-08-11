import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

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

import { ManifestNotFoundError } from '../../manifest/readManifest.ts';
import { captureRdyError } from '../../test-utils/captureRdyError.ts';
import { listCommand } from '../listCommand.ts';

describe(listCommand, () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
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

      const exitCode = await listCommand([]);

      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(exitCode).toBe(0);
      expect(output).toContain('Packages');
      expect(output).toContain('@acme/kits@2.1.0 / \u{1F4D3} drift');
      expect(output).not.toContain('No kits found');
    });

    it('names installed packages that publish kits the config omits', async () => {
      mockDiscoverKitPackages.mockReturnValue(['@acme/kits', 'plain-kit']);
      configureOnePackage();

      await listCommand([]);

      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Available');
      expect(output).toContain('plain-kit');
      // Already configured, so it belongs under Packages rather than as a candidate to add.
      expect(output.slice(output.indexOf('Available'))).not.toContain('@acme/kits');
    });

    it('carries package provenance into the JSON payload, apart from the kits it lists', async () => {
      mockDiscoverKitPackages.mockReturnValue(['plain-kit']);
      configureOnePackage();

      await listCommand(['--json']);

      const payload: unknown = JSON.parse(String(stdoutSpy.mock.calls.at(-1)?.[0]));
      expect(payload).toMatchObject({
        kits: [{ name: 'drift', kind: 'compiled', origin: { package: '@acme/kits', version: '2.1.0' } }],
        availablePackages: ['plain-kit'],
      });
    });
  });

  describe('owner mode', () => {
    it('loads config and reads manifest for compiled kits', async () => {
      mockEnumerateKits.mockReturnValue(['default']);
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy' }],
      });

      const exitCode = await listCommand([]);

      expect(exitCode).toBe(0);
      expect(mockLoadConfig).toHaveBeenCalledWith();
      expect(mockReadManifest).toHaveBeenCalledTimes(1);
      // Package discovery is mocked out in this file, so the count covers internal kits alone.
      expect(mockEnumerateKits).toHaveBeenCalledTimes(1);
      expect(mockEnumerateKits).toHaveBeenCalledWith(
        expect.objectContaining({ dir: expect.stringContaining('.readyup/kits'), extension: '.ts' }),
      );
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('\u{2500}\u{2500} Internal');
      expect(output).toContain('\u{2500}\u{2500} Compiled');
    });

    it('uses infix-based extension for internal kits when configured', async () => {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
        internal: { dir: '.', infix: 'int' },
        packages: [],
      });
      mockEnumerateKits.mockReturnValue(['default']);

      const exitCode = await listCommand([]);

      expect(exitCode).toBe(0);
      expect(mockEnumerateKits).toHaveBeenCalledWith(expect.objectContaining({ extension: '.int.ts' }));
    });

    it('renders only Internal section when manifest has no compiled kits', async () => {
      mockEnumerateKits.mockReturnValue(['default']);
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });

      const exitCode = await listCommand([]);

      expect(exitCode).toBe(0);
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('\u{2500}\u{2500} Internal');
      expect(output).not.toContain('\u{2500}\u{2500} Compiled');
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

      const exitCode = await listCommand([]);

      expect(exitCode).toBe(0);
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('dist/kits/deploy.js');
      expect(output).toContain('--file');
    });

    it('prints empty-owner message when no kits exist', async () => {
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
      });

      const exitCode = await listCommand([]);

      expect(exitCode).toBe(0);
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('No kits found.');
    });

    it('warns and lists with default settings when config load fails', async () => {
      mockLoadConfig.mockRejectedValue(new Error('bad config'));
      mockEnumerateKits.mockReturnValue(['default']);

      const exitCode = await listCommand([]);

      expect(exitCode).toBe(0);
      expect(stderrSpy).toHaveBeenCalledWith('Warning: bad config. Listing with default settings.\n');
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('default');
    });

    it('renders a hint the config failure carries, on a line of its own', async () => {
      mockLoadConfig.mockRejectedValue(
        Object.assign(new Error("Cannot resolve 'some-lib' while evaluating config.ts."), {
          hint: 'Install it with: pnpm add --save-dev some-lib',
        }),
      );

      await listCommand([]);

      expect(stderrSpy.mock.calls.map((call: unknown[]) => String(call[0]))).toStrictEqual([
        "Warning: Cannot resolve 'some-lib' while evaluating config.ts. Listing with default settings.\n",
        '\u{1F4A1} Hint: Install it with: pnpm add --save-dev some-lib\n',
      ]);
    });

    it('writes no hint line for a config failure that carries none', async () => {
      mockLoadConfig.mockRejectedValue(new Error('bad config'));

      await listCommand([]);

      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });

    it('does not double the period when the config failure already ends in one', async () => {
      mockLoadConfig.mockRejectedValue(new Error('bad config.'));

      await listCommand([]);

      expect(stderrSpy).toHaveBeenCalledWith('Warning: bad config. Listing with default settings.\n');
    });

    it('reports a config error when enumerateKits throws', async () => {
      const permError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
      mockEnumerateKits.mockImplementation(() => {
        throw permError;
      });

      const error = await captureRdyError(() => listCommand([]));

      expect(error.code).toBe('config');
      expect(error.message).toContain('permission denied');
    });

    it('renders Internal section without Compiled when manifest file is missing and internal kits exist', async () => {
      mockEnumerateKits.mockReturnValue(['default']);
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
      });

      const exitCode = await listCommand([]);

      expect(exitCode).toBe(0);
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('\u{2500}\u{2500} Internal');
      expect(output).not.toContain('\u{2500}\u{2500} Compiled');
      expect(stderrSpy).not.toHaveBeenCalled();
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

      await listCommand([]);

      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('\u{2500}\u{2500} Internal\n   rdy run --jit --internal [<name>]');
    });

    it('leaves --internal out of the internal hint under the default config', async () => {
      mockEnumerateKits.mockReturnValue(['default']);

      await listCommand([]);

      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('\u{2500}\u{2500} Internal\n   rdy run --jit [<name>]');
    });

    it('writes warning to stderr when manifest read fails with non-missing-file error and internal kits exist', async () => {
      mockEnumerateKits.mockReturnValue(['default']);
      mockReadManifest.mockImplementation(() => {
        throw new Error('Manifest file contains invalid JSON: .readyup/manifest.json');
      });

      const exitCode = await listCommand([]);

      expect(exitCode).toBe(0);
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('\u{2500}\u{2500} Internal');
      expect(output).not.toContain('\u{2500}\u{2500} Compiled');
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Warning:'));
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('invalid JSON'));
    });
  });

  describe('from mode', () => {
    it('does not load config when --from is given', async () => {
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });

      const exitCode = await listCommand(['--from', '.']);

      expect(exitCode).toBe(0);
      expect(mockLoadConfig).not.toHaveBeenCalled();
    });

    it('reads manifest from a local path and displays compiled kits', async () => {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy' }],
      });

      const exitCode = await listCommand(['--from', '.']);

      expect(exitCode).toBe(0);
      expect(mockReadManifest).toHaveBeenCalledWith(expect.stringContaining('.readyup/manifest.json'));
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('\u{2500}\u{2500} Compiled');
      expect(output).toContain('deploy');
    });

    it('prints empty-consumer message when manifest contains no kits', async () => {
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });

      const exitCode = await listCommand(['--from', '.']);

      expect(exitCode).toBe(0);
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('No compiled kits found');
    });

    it('reports a config error when the manifest is not found at the --from path', async () => {
      mockReadManifest.mockImplementation(() => {
        throw new Error('Manifest file not found: /nonexistent/.readyup/manifest.json');
      });

      const error = await captureRdyError(() => listCommand(['--from', '/nonexistent']));

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

      const exitCode = await listCommand(['--manifest', '.readyup/manifest.json']);

      expect(exitCode).toBe(0);
      expect(mockLoadConfig).not.toHaveBeenCalled();
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('\u{2500}\u{2500} Manifest:');
      expect(output).toContain('default');
      expect(output).toContain('Health checks');
      expect(output).toContain('deploy');
    });

    it('reports a config error when the manifest file cannot be read', async () => {
      mockReadManifest.mockImplementation(() => {
        throw new Error('Manifest file not found: /missing/manifest.json');
      });

      const error = await captureRdyError(() => listCommand(['--manifest', '/missing/manifest.json']));

      expect(error.code).toBe('config');
      expect(error.message).toContain('Manifest file not found');
    });

    it('reports a usage error when --from and --manifest are both provided', async () => {
      const error = await captureRdyError(() => listCommand(['--from', '.', '--manifest', '.readyup/manifest.json']));

      expect(error.code).toBe('usage');
      expect(error.message).toContain('mutually exclusive');
    });
  });

  describe('--json', () => {
    /** Read the single JSON document the command wrote to stdout. */
    function parseStdout(): unknown {
      return JSON.parse(stdoutSpy.mock.calls.map((c) => String(c[0])).join(''));
    }

    it('distinguishes internal sources from compiled kits in owner mode', async () => {
      mockEnumerateKits.mockReturnValue(['draft']);
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy', path: 'kits/deploy.js', checklists: ['preflight'] }],
      });

      const exitCode = await listCommand(['--json']);

      expect(exitCode).toBe(0);
      expect(parseStdout()).toMatchObject({
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

      await listCommand(['--json']);

      expect(stdoutSpy).toHaveBeenCalledTimes(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('\u{2500}\u{2500} Internal'));
    });

    it('reports an empty kit list rather than the empty-owner prose', async () => {
      mockEnumerateKits.mockReturnValue([]);
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
      });

      await listCommand(['--json']);

      expect(parseStdout()).toStrictEqual({ schemaVersion: 1, kits: [] });
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('No kits found.'));
    });

    it('carries the manifest fields in manifest mode', async () => {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy', description: 'Deploy checks', readyupVersion: '0.21.2' }],
      });

      await listCommand(['--manifest', '.readyup/manifest.json', '--json']);

      expect(parseStdout()).toStrictEqual({
        schemaVersion: 1,
        kits: [{ name: 'deploy', kind: 'compiled', description: 'Deploy checks', readyupVersion: '0.21.2' }],
      });
    });
  });

  it('reports a usage error for unknown flags', async () => {
    const error = await captureRdyError(() => listCommand(['--unknown']));

    expect(error.code).toBe('usage');
    expect(error.message).toContain("Unknown option '--unknown'");
  });
});
