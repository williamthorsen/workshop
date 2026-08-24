import { realpathSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VERSION } from '../../version.ts';
import { KIT_COMPILE_TARGET, KIT_TSCONFIG } from '../buildBundle.ts';
import { compileConfig } from '../compileConfig.ts';

const mockBuild = vi.hoisted(() => vi.fn());
const mockLoadEsbuild = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockMkdirSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());

vi.mock(import('../loadEsbuild.ts'), () => ({
  loadEsbuild: mockLoadEsbuild,
}));

// Spreads the original so that `realpathSync`, which the compile root is resolved through, stays real.
vi.mock(import('node:fs'), async (importOriginal) => ({
  ...(await importOriginal()),
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}));

// Names a directory that exists whatever the working directory is, because the compile root is resolved
// through `realpathSync` of the entry's own directory once `existsSync` reports no `package.json` above it.
const CONFIG_PATH = path.join(import.meta.dirname, 'readyup.config.ts');

describe(compileConfig, () => {
  beforeEach(() => {
    // Default: The esbuild import succeeds and exposes the mocked `build`.
    // Failure-path tests override this with `mockRejectedValue`.
    mockLoadEsbuild.mockResolvedValue({ build: mockBuild, version: '0.99.0-test' });
  });

  afterEach(() => {
    mockBuild.mockReset();
    mockLoadEsbuild.mockReset();
    mockExistsSync.mockReset();
    mockMkdirSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
  });

  it('invokes esbuild with write: false and no outfile', async () => {
    mockBuild.mockResolvedValue(buildResult('compiled'));
    mockExistsSync.mockReturnValue(false);

    await compileConfig(CONFIG_PATH);

    expect(mockBuild).toHaveBeenCalledWith({
      entryPoints: [CONFIG_PATH],
      // `existsSync` reports no `package.json` anywhere, so the compile root falls back to the source's
      // own directory.
      absWorkingDir: realpathSync(import.meta.dirname),
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: KIT_COMPILE_TARGET,
      tsconfigRaw: KIT_TSCONFIG,
      external: ['node:*', 'readyup', 'readyup/*'],
      plugins: [expect.objectContaining({ name: 'pick-json' })],
      banner: { js: expect.stringContaining('@generated') },
      metafile: true,
      write: false,
    });
  });

  it('embeds an export of __readyupVersion in the banner', async () => {
    mockBuild.mockResolvedValue(buildResult('compiled'));
    mockExistsSync.mockReturnValue(false);

    await compileConfig(CONFIG_PATH);

    expect(mockBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        banner: { js: expect.stringContaining(`export const __readyupVersion = ${JSON.stringify(VERSION)};`) },
      }),
    );
  });

  it('returns the loaded esbuild module version as esbuildVersion', async () => {
    mockBuild.mockResolvedValue(buildResult('compiled'));
    mockExistsSync.mockReturnValue(false);

    const result = await compileConfig(CONFIG_PATH);

    expect(result.esbuildVersion).toBe('0.99.0-test');
  });

  it('returns no bundled dependencies when the metafile names no node_modules input', async () => {
    mockBuild.mockResolvedValue(buildResult('compiled'));
    mockExistsSync.mockReturnValue(false);

    const result = await compileConfig(CONFIG_PATH);

    expect(result.bundledDependencies).toStrictEqual({});
  });

  it('returns the resolved output path', async () => {
    mockBuild.mockResolvedValue(buildResult('compiled'));
    mockExistsSync.mockReturnValue(false);

    const result = await compileConfig(CONFIG_PATH);

    expect(result.outputPath).toBe(path.join(import.meta.dirname, 'readyup.config.js'));
  });

  it('uses a custom output path when provided', async () => {
    mockBuild.mockResolvedValue(buildResult('compiled'));
    mockExistsSync.mockReturnValue(false);

    const result = await compileConfig(CONFIG_PATH, 'dist/bundle.js');

    expect(result.outputPath).toBe(path.resolve('dist/bundle.js'));
  });

  it.each([
    ['input.ts', 'input.js'],
    ['input.mts', 'input.js'],
    ['input.cts', 'input.js'],
    ['input.js', 'input.js.js'],
  ])('derives the default output path for %s as %s', async (input, expectedSuffix) => {
    mockBuild.mockResolvedValue(buildResult('compiled'));
    mockExistsSync.mockReturnValue(false);

    const result = await compileConfig(input);

    expect(result.outputPath).toBe(path.resolve(expectedSuffix));
  });

  it('writes the output and returns changed: true when no existing file exists', async () => {
    mockBuild.mockResolvedValue(buildResult('compiled'));
    mockExistsSync.mockReturnValue(false);

    const result = await compileConfig('input.ts');

    expect(result.changed).toBe(true);
    expect(mockMkdirSync).toHaveBeenCalledWith(path.dirname(path.resolve('input.js')), { recursive: true });
    expect(mockWriteFileSync).toHaveBeenCalledWith(path.resolve('input.js'), expect.any(Buffer));
  });

  it('writes the output and returns changed: true when existing file differs', async () => {
    mockBuild.mockResolvedValue(buildResult('new content'));
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(Buffer.from('old content'));

    const result = await compileConfig('input.ts');

    expect(result.changed).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
  });

  it('skips writing and returns changed: false when existing file is identical', async () => {
    const content = 'identical content';
    mockBuild.mockResolvedValue(buildResult(content));
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(Buffer.from(content));

    const result = await compileConfig('input.ts');

    expect(result.changed).toBe(false);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('propagates a build failure that names no unresolved import, unchanged', async () => {
    mockBuild.mockRejectedValue(new Error('Build failed'));

    // Anchored, so a guard that started matching every failure would append its hint here and fail.
    await expect(compileConfig('input.ts')).rejects.toThrow(/^Build failed$/);
  });

  it('throws a clear error when esbuild is not installed', async () => {
    mockLoadEsbuild.mockRejectedValue(new Error('Cannot find module esbuild'));

    await expect(compileConfig('input.ts')).rejects.toThrow('esbuild is required');
  });

  it('chains the original error as cause when esbuild import fails', async () => {
    const importError = new Error('Cannot find module esbuild');
    mockLoadEsbuild.mockRejectedValue(importError);

    await expect(compileConfig('input.ts')).rejects.toThrow(expect.objectContaining({ cause: importError }));
  });
});

/** Builds a mock esbuild result with the given output text and no resolved modules. */
function buildResult(text: string) {
  return { metafile: { inputs: {} }, outputFiles: [{ contents: new TextEncoder().encode(text) }] };
}
