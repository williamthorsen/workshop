import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCompileConfig = vi.hoisted(() => vi.fn());
const mockLoadConfig = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockReaddirSync = vi.hoisted(() => vi.fn());
const mockRealpathSync = vi.hoisted(() => Object.assign(vi.fn(), { native: vi.fn() }));
const mockPicomatch = vi.hoisted(() => vi.fn());
const mockWriteManifest = vi.hoisted(() => vi.fn());
const mockReadManifest = vi.hoisted(() => vi.fn());
const mockCheckDrift = vi.hoisted(() => vi.fn());
const mockWarnOnUnrecordedBundles = vi.hoisted(() => vi.fn());

vi.mock(import('../compileConfig.ts'), () => ({
  compileConfig: mockCompileConfig,
}));

vi.mock(import('../../config/loadConfig.ts'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/loadConfig.ts')>();
  return { ...actual, loadConfig: mockLoadConfig };
});

vi.mock(import('node:fs'), () => ({
  existsSync: mockExistsSync,
  readdirSync: mockReaddirSync,
  realpathSync: mockRealpathSync,
}));

vi.mock('picomatch', () => ({
  default: mockPicomatch,
}));

vi.mock(import('../../manifest/writeManifest.ts'), () => ({
  writeManifest: mockWriteManifest,
}));

vi.mock(import('../../manifest/readManifest.ts'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../manifest/readManifest.ts')>();
  return {
    ManifestNotFoundError: actual.ManifestNotFoundError,
    readManifest: mockReadManifest,
  };
});

vi.mock(import('../../verify/checkDrift.ts'), () => ({
  checkDrift: mockCheckDrift,
}));

// The output directory is scanned through the real filesystem, which these tests replace with sweep-shaped stubs.
vi.mock(import('../warnOnUnrecordedBundles.ts'), () => ({
  warnOnUnrecordedBundles: mockWarnOnUnrecordedBundles,
}));

import { ManifestNotFoundError } from '../../manifest/readManifest.ts';
import { compileCommand } from '../compileCommand.ts';
import type { CompileResult } from '../compileConfig.ts';
import { compileResult, kitSource, SRC_DIR } from '../test-utils/compile-result-fixtures.ts';
import { compile } from '../test-utils/compile-runners.ts';

describe(compileCommand, () => {
  beforeEach(() => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: SRC_DIR, outDir: SRC_DIR, include: undefined, exclude: [] },
    });
    mockCheckDrift.mockReturnValue({ kind: 'unverified' });
    mockWarnOnUnrecordedBundles.mockReturnValue([]);
    // No path named by these tests contains a symlink, so a real path is the path itself.
    mockRealpathSync.mockImplementation((target: string) => target);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockCompileConfig.mockReset();
    mockLoadConfig.mockReset();
    mockExistsSync.mockReset();
    mockReaddirSync.mockReset();
    mockRealpathSync.mockReset();
    mockPicomatch.mockReset();
    mockWriteManifest.mockReset();
    mockReadManifest.mockReset();
    mockCheckDrift.mockReset();
    mockWarnOnUnrecordedBundles.mockReset();
  });

  describe('--json', () => {
    it('reports every kit status on stdout and keeps prose on stderr', async () => {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
      });
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['alpha.ts', 'beta.ts']);
      mockCompileConfig
        .mockRejectedValueOnce(new Error('alpha is not valid TypeScript'))
        .mockResolvedValueOnce(
          compileResult(kitSource('beta.ts'), { outputPath: '/abs/beta.js', changed: true, targetHash: 'bbbb2222' }),
        );

      const { exitCode, stdout, stdoutChunks } = await compile(['--json']);

      expect(exitCode).toBe(1);
      expect(stdoutChunks).toHaveLength(1);
      expect(JSON.parse(stdout)).toStrictEqual({
        schemaVersion: 1,
        passed: false,
        kits: [
          { name: 'alpha', status: 'failed', error: 'alpha is not valid TypeScript' },
          { name: 'beta', status: 'compiled' },
        ],
      });
    });

    it('reports a clean single-file compile as passed', async () => {
      mockCompileConfig.mockResolvedValue(
        compileResult('deploy.ts', { outputPath: '/abs/deploy.js', changed: true, targetHash: 'aaaa1111' }),
      );
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('missing');
      });

      const { exitCode, stdout } = await compile(['deploy.ts', '--json']);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({
        passed: true,
        kits: [{ name: 'deploy', status: 'compiled' }],
      });
    });

    it('reports a drift-skipped kit with the reason it was left alone', async () => {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy', path: 'deploy.js', targetHash: 'aaaa1111' }],
      });
      mockCheckDrift.mockReturnValue({
        kind: 'drift',
        expected: 'aaaa1111',
        actual: 'ffff9999',
        resolvedPath: '/abs/deploy.js',
      });

      const { exitCode, stdout } = await compile(['deploy.ts', '--json']);

      expect(exitCode).toBe(1);
      expect(JSON.parse(stdout)).toMatchObject({
        passed: false,
        kits: [{ name: 'deploy', status: 'skipped', error: expect.stringContaining('drifted') }],
      });
    });
  });

  describe('inlined JSON warnings', () => {
    beforeEach(() => {
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('missing');
      });
    });

    it('warns on stderr after a single-file compile, which still passes', async () => {
      mockCompileConfig.mockResolvedValue(compileResultInliningJson('deploy.ts', '/abs/deploy.js'));

      const { exitCode, stderr } = await compile(['deploy.ts']);

      expect(exitCode).toBe(0);
      expect(stderr).toContain('Warning: kit "deploy" bundles all of package.json, imported by deploy.ts,');
    });

    it('reports the warning in the payload of a single-file compile under --json', async () => {
      mockCompileConfig.mockResolvedValue(compileResultInliningJson('deploy.ts', '/abs/deploy.js'));

      const { exitCode, stdout, stderr } = await compile(['deploy.ts', '--json']);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toStrictEqual({
        schemaVersion: 1,
        passed: true,
        kits: [{ name: 'deploy', status: 'compiled' }],
        warnings: [
          {
            code: 'json-inlined',
            message: expect.stringContaining('kit "deploy" bundles all of package.json'),
            remedy: expect.stringContaining('pickJson'),
          },
        ],
      });
      expect(stderr).toContain('Warning: kit "deploy"');
    });

    it('collects the warnings of every kit in a batch compile under --json', async () => {
      arrangeBatch(['alpha.ts', 'beta.ts']);
      mockCompileConfig
        .mockResolvedValueOnce(compileResultInliningJson(kitSource('alpha.ts'), '/abs/alpha.js'))
        .mockResolvedValueOnce(compileResultInliningJson(kitSource('beta.ts'), '/abs/beta.js'));

      const { exitCode, stdout } = await compile(['--json']);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({
        passed: true,
        warnings: [
          { code: 'json-inlined', message: expect.stringContaining('kit "alpha"') },
          { code: 'json-inlined', message: expect.stringContaining('kit "beta"') },
        ],
      });
    });

    it('raises no warning for a kit that fails validation', async () => {
      arrangeBatch(['alpha.ts']);
      mockCompileConfig.mockRejectedValue(new Error('Kit must export a default RdyKit'));

      const { exitCode, stdout, stderr } = await compile(['--json']);

      expect(exitCode).toBe(1);
      expect(JSON.parse(stdout)).not.toHaveProperty('warnings');
      expect(stderr).not.toContain('bundles all of');
    });

    // region | Helpers

    /** Arranges a batch compile over `fileNames` in the swept source directory. */
    function arrangeBatch(fileNames: string[]): void {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: SRC_DIR, outDir: SRC_DIR, include: undefined, exclude: [] },
      });
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(fileNames);
    }

    // endregion | Helpers
  });
});

// region | Helpers

/** Builds a changed `compileConfig` result for `entry` whose bundle includes `package.json` whole, imported by the entry. */
function compileResultInliningJson(entry: string, outputPath: string): CompileResult {
  return {
    ...compileResult(entry, { outputPath, changed: true, targetHash: 'aaaa1111' }),
    inlinedJson: [{ importers: [path.resolve(entry)], path: path.resolve('package.json') }],
  };
}

// endregion | Helpers
