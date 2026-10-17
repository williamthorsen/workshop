import path from 'node:path';
import process from 'node:process';

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
import { VERSION } from '../../version.ts';
import { compileCommand } from '../compileCommand.ts';
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

  describe('sweep that finds no kits', () => {
    it('writes no manifest when the source directory is absent and no manifest exists', async () => {
      arrangeEmptySweep({ srcDirExists: false, manifestExists: false });

      const { exitCode, stdout } = await compile([]);

      expect(exitCode).toBe(0);
      expect(mockReaddirSync).not.toHaveBeenCalled();
      expect(mockWriteManifest).not.toHaveBeenCalled();
      expect(stdout).toContain('Source directory not found: .readyup/kits; manifest not written');
      expect(stdout).toContain('Hint: Run `rdy init` to scaffold a kit.');
    });

    it('writes no manifest when the source directory holds no .ts files and no manifest exists', async () => {
      arrangeEmptySweep({ srcDirExists: true, manifestExists: false });
      mockReaddirSync.mockReturnValue(['readme.md']);

      const { exitCode, stdout } = await compile([]);

      expect(exitCode).toBe(0);
      expect(mockWriteManifest).not.toHaveBeenCalled();
      expect(stdout).toContain('No .ts files found in .readyup/kits; manifest not written');
      expect(stdout).toContain('Hint: Run `rdy init` to scaffold a kit.');
    });

    it('names the configured source directory when `rdy init` would not scaffold into it', async () => {
      arrangeEmptySweep({ srcDirExists: false, manifestExists: false, srcDir: 'kits/src' });

      const { exitCode, stdout } = await compile([]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Hint: Add a kit source to kits/src.');
    });

    it('carries the next step as the payload hint under --json', async () => {
      arrangeEmptySweep({ srcDirExists: false, manifestExists: false });

      const { exitCode, stdout } = await compile(['--json']);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toStrictEqual({
        schemaVersion: 1,
        passed: true,
        kits: [],
        hint: 'Run `rdy init` to scaffold a kit.',
      });
    });

    it('omits the hint from the payload when a manifest exists', async () => {
      arrangeEmptySweep({ srcDirExists: false, manifestExists: true });

      const { stdout } = await compile(['--json']);

      expect(JSON.parse(stdout)).not.toHaveProperty('hint');
    });

    it('empties an existing manifest when the source directory is absent', async () => {
      arrangeEmptySweep({ srcDirExists: false, manifestExists: true });

      const { exitCode, stdout } = await compile([]);

      expect(exitCode).toBe(0);
      expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), { version: 1, kits: [] });
      expect(stdout).toBe('Source directory not found: .readyup/kits; manifest now lists no kits\n');
    });

    it('empties an existing manifest when the source directory holds no .ts files', async () => {
      arrangeEmptySweep({ srcDirExists: true, manifestExists: true });
      mockReaddirSync.mockReturnValue(['readme.md']);

      const { exitCode, stdout } = await compile([]);

      expect(exitCode).toBe(0);
      expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), { version: 1, kits: [] });
      expect(stdout).toContain('manifest now lists no kits');
    });

    it('gates on the path named by --manifest rather than the default', async () => {
      arrangeEmptySweep({ srcDirExists: false, manifestExists: false });

      await compile(['--manifest', 'custom/manifest.json']);

      expect(mockExistsSync).toHaveBeenCalledWith(path.resolve(process.cwd(), 'custom/manifest.json'));
      expect(mockWriteManifest).not.toHaveBeenCalled();
    });

    it('omits the manifest clause under --skip-manifest when the source directory is absent', async () => {
      arrangeEmptySweep({ srcDirExists: false, manifestExists: true });

      const { exitCode, stdout } = await compile(['--skip-manifest']);

      expect(exitCode).toBe(0);
      expect(mockWriteManifest).not.toHaveBeenCalled();
      expect(stdout).toBe('Source directory not found: .readyup/kits\n');
    });

    it('omits the manifest clause under --skip-manifest when the directory holds no .ts files', async () => {
      arrangeEmptySweep({ srcDirExists: true, manifestExists: true });
      mockReaddirSync.mockReturnValue(['readme.md']);

      const { exitCode, stdout } = await compile(['--skip-manifest']);

      expect(exitCode).toBe(0);
      expect(mockWriteManifest).not.toHaveBeenCalled();
      expect(stdout).toBe('No .ts files found in .readyup/kits\n');
    });

    // region | Helpers

    /** Arranges a config-driven sweep that finds no kits, over a manifest that, if it exists, records none. */
    function arrangeEmptySweep({
      srcDir = '.readyup/kits',
      ...existence
    }: ArrangeExistenceArgs & { srcDir?: string }): void {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir, outDir: srcDir, include: undefined, exclude: [] },
      });
      arrangeExistence(existence);
      mockReadManifest.mockImplementation((manifestPath: string) => {
        if (!existence.manifestExists) throw new ManifestNotFoundError(manifestPath);
        return { version: 1, kits: [] };
      });
    }

    // endregion | Helpers
  });

  describe('sweep completion', () => {
    /** Arranges a two-kit batch whose first kit fails to compile and whose second succeeds. */
    function arrangeMixedBatch(): void {
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
    }

    it('compiles the kits after a failed one instead of abandoning the sweep', async () => {
      arrangeMixedBatch();

      const { exitCode, stdout, stderr } = await compile([]);

      expect(exitCode).toBe(1);
      expect(mockCompileConfig).toHaveBeenCalledTimes(2);
      expect(stderr).toContain('Error compiling alpha.ts');
      expect(stdout).toContain('beta.ts');
    });

    it('reports how many kits failed once the sweep finishes', async () => {
      arrangeMixedBatch();

      const { stdout } = await compile([]);

      expect(stdout).toContain('1 of 2 kits failed to compile.');
    });

    it('writes a manifest when sources are found but every one fails to compile', async () => {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
      });
      arrangeExistence({ srcDirExists: true, manifestExists: false });
      mockReaddirSync.mockReturnValue(['alpha.ts', 'beta.ts']);
      mockCompileConfig.mockRejectedValue(new Error('not valid TypeScript'));

      const { exitCode } = await compile([]);

      expect(exitCode).toBe(1);
      expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), { version: 1, kits: [] });
    });

    it('leaves a failed kit out of the manifest rather than recording it as compiled', async () => {
      arrangeMixedBatch();

      await compile([]);

      expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
        version: 1,
        kits: [expect.objectContaining({ name: 'beta' })],
      });
    });

    it('keeps the manifest entry that a failed kit already had', async () => {
      arrangeMixedBatch();
      const recordedAlpha = {
        name: 'alpha',
        path: 'alpha.js',
        readyupVersion: VERSION,
        source: 'alpha.ts',
        targetHash: 'aaaa1111',
      };
      mockReadManifest.mockReturnValue({ version: 1, kits: [recordedAlpha] });

      await compile([]);

      expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
        version: 1,
        kits: [recordedAlpha, expect.objectContaining({ name: 'beta' })],
      });
    });

    it('reports the failure even though the kit keeps its entry', async () => {
      arrangeMixedBatch();
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [
          { name: 'alpha', path: 'alpha.js', readyupVersion: VERSION, source: 'alpha.ts', targetHash: 'aaaa1111' },
        ],
      });

      const { exitCode, stderr } = await compile([]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Error compiling alpha.ts');
    });
  });

  it('treats an include glob matching only non-.ts files as a sweep that finds no kits', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: ['data/*'], exclude: [] },
    });
    arrangeExistence({ srcDirExists: true, manifestExists: true });
    mockReaddirSync.mockReturnValue(['data/readme.md', 'data/config.json']);
    mockPicomatch.mockReturnValue(() => true);

    const { exitCode } = await compile([]);

    expect(exitCode).toBe(0);
    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), { version: 1, kits: [] });
  });

  // region | Helpers

  interface ArrangeExistenceArgs {
    srcDirExists: boolean;
    manifestExists: boolean;
  }

  /** Stubs `existsSync` per path, so that the source directory and the manifest are arranged independently. */
  function arrangeExistence(existence: ArrangeExistenceArgs): void {
    const { srcDirExists, manifestExists } = existence;
    mockExistsSync.mockImplementation((target: unknown) =>
      String(target).endsWith('manifest.json') ? manifestExists : srcDirExists,
    );
  }

  // endregion | Helpers
});
