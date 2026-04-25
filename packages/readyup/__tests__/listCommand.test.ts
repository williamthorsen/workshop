import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

const mockLoadConfig = vi.hoisted(() => vi.fn());
const mockEnumerateKits = vi.hoisted(() => vi.fn());
const mockReadManifest = vi.hoisted(() => vi.fn());

vi.mock('../src/loadConfig.ts', () => ({
  loadConfig: mockLoadConfig,
}));

vi.mock('../src/list/enumerateKits.ts', () => ({
  enumerateKits: mockEnumerateKits,
}));

vi.mock('../src/manifest/readManifest.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/manifest/readManifest.ts')>();
  return {
    ManifestNotFoundError: actual.ManifestNotFoundError,
    readManifest: mockReadManifest,
  };
});

import { listCommand } from '../src/list/listCommand.ts';
import { ManifestNotFoundError } from '../src/manifest/readManifest.ts';

describe(listCommand, () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
      internal: { dir: '.', infix: undefined },
    });
    mockEnumerateKits.mockReturnValue([]);
    mockReadManifest.mockReturnValue({ version: 1, kits: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockLoadConfig.mockReset();
    mockEnumerateKits.mockReset();
    mockReadManifest.mockReset();
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
      expect(mockLoadConfig).toHaveBeenCalled();
      expect(mockReadManifest).toHaveBeenCalled();
      // enumerateKits is only called for internal kits
      expect(mockEnumerateKits).toHaveBeenCalledTimes(1);
      expect(mockEnumerateKits).toHaveBeenCalledWith(
        expect.objectContaining({ dir: expect.stringContaining('.readyup/kits'), extension: '.ts' }),
      );
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Internal:');
      expect(output).toContain('Compiled:');
    });

    it('uses infix-based extension for internal kits when configured', async () => {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
        internal: { dir: '.', infix: 'int' },
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
      expect(output).toContain('Internal:');
      expect(output).not.toContain('Compiled:');
    });

    it('uses custom-outDir style when outDir differs from default', async () => {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: 'src/kits', outDir: 'dist/kits', include: undefined },
        internal: { dir: '.', infix: undefined },
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

    it('returns 1 and writes to stderr when config load fails', async () => {
      mockLoadConfig.mockRejectedValue(new Error('bad config'));

      const exitCode = await listCommand([]);

      expect(exitCode).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('bad config'));
    });

    it('returns 1 and writes to stderr when enumerateKits throws', async () => {
      const permError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
      mockEnumerateKits.mockImplementation(() => {
        throw permError;
      });

      const exitCode = await listCommand([]);

      expect(exitCode).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('permission denied'));
    });

    it('renders Internal section without Compiled when manifest file is missing and internal kits exist', async () => {
      mockEnumerateKits.mockReturnValue(['default']);
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
      });

      const exitCode = await listCommand([]);

      expect(exitCode).toBe(0);
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Internal:');
      expect(output).not.toContain('Compiled:');
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('writes warning to stderr when manifest read fails with non-missing-file error and internal kits exist', async () => {
      mockEnumerateKits.mockReturnValue(['default']);
      mockReadManifest.mockImplementation(() => {
        throw new Error('Manifest file contains invalid JSON: .readyup/manifest.json');
      });

      const exitCode = await listCommand([]);

      expect(exitCode).toBe(0);
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Internal:');
      expect(output).not.toContain('Compiled:');
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
      expect(output).toContain('Compiled:');
      expect(output).toContain('deploy');
    });

    it('prints empty-consumer message when manifest contains no kits', async () => {
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });

      const exitCode = await listCommand(['--from', '.']);

      expect(exitCode).toBe(0);
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('No compiled kits found');
    });

    it('returns 1 when manifest is not found at --from path', async () => {
      mockReadManifest.mockImplementation(() => {
        throw new Error('Manifest file not found: /nonexistent/.readyup/manifest.json');
      });

      const exitCode = await listCommand(['--from', '/nonexistent']);

      expect(exitCode).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Manifest file not found'));
    });

    it('returns 1 for bitbucket: scheme with not-yet-supported message', async () => {
      const exitCode = await listCommand(['--from', 'bitbucket:team/repo']);

      expect(exitCode).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('not yet supported'));
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
      expect(output).toContain('Manifest:');
      expect(output).toContain('default');
      expect(output).toContain('Health checks');
      expect(output).toContain('deploy');
    });

    it('returns 1 when manifest file cannot be read', async () => {
      mockReadManifest.mockImplementation(() => {
        throw new Error('Manifest file not found: /missing/manifest.json');
      });

      const exitCode = await listCommand(['--manifest', '/missing/manifest.json']);

      expect(exitCode).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Manifest file not found'));
    });

    it('returns 1 when --from and --manifest are both provided', async () => {
      const exitCode = await listCommand(['--from', '.', '--manifest', '.readyup/manifest.json']);

      expect(exitCode).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('mutually exclusive'));
    });
  });

  it('returns 1 for unknown flags', async () => {
    const exitCode = await listCommand(['--unknown']);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown option: --unknown'));
  });
});
