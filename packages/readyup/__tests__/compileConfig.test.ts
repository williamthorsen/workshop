import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockBuild = vi.hoisted(() => vi.fn());
const mockLoadEsbuild = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockMkdirSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());

vi.mock('../src/compile/loadEsbuild.ts', () => ({
  loadEsbuild: mockLoadEsbuild,
}));

vi.mock(import('node:fs'), () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}));

import { compileConfig, KIT_COMPILE_TARGET } from '../src/compile/compileConfig.ts';
import { VERSION } from '../src/version.ts';

describe(compileConfig, () => {
  beforeEach(() => {
    // Default: The esbuild import succeeds and exposes the mocked `build`.
    // Failure-path tests override this with `mockRejectedValue`.
    mockLoadEsbuild.mockResolvedValue({ build: mockBuild });
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

    await compileConfig('config/readyup.config.ts');

    expect(mockBuild).toHaveBeenCalledWith({
      entryPoints: [path.resolve('config/readyup.config.ts')],
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: KIT_COMPILE_TARGET,
      external: ['node:*', 'readyup', 'readyup/*'],
      plugins: [expect.objectContaining({ name: 'pick-json' })],
      banner: { js: expect.stringContaining('@generated') },
      write: false,
    });
  });

  it('embeds an export of __readyupVersion in the banner', async () => {
    mockBuild.mockResolvedValue(buildResult('compiled'));
    mockExistsSync.mockReturnValue(false);

    await compileConfig('config/readyup.config.ts');

    expect(mockBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        banner: { js: expect.stringContaining(`export const __readyupVersion = ${JSON.stringify(VERSION)};`) },
      }),
    );
  });

  it('returns the resolved output path', async () => {
    mockBuild.mockResolvedValue(buildResult('compiled'));
    mockExistsSync.mockReturnValue(false);

    const result = await compileConfig('config/readyup.config.ts');

    expect(result.outputPath).toBe(path.resolve('config/readyup.config.js'));
  });

  it('uses a custom output path when provided', async () => {
    mockBuild.mockResolvedValue(buildResult('compiled'));
    mockExistsSync.mockReturnValue(false);

    const result = await compileConfig('config/readyup.config.ts', 'dist/bundle.js');

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
    expect(mockWriteFileSync).toHaveBeenCalled();
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

  it('propagates errors from esbuild.build', async () => {
    mockBuild.mockRejectedValue(new Error('Build failed'));

    await expect(compileConfig('input.ts')).rejects.toThrow('Build failed');
  });

  it('throws a clear error when esbuild is not installed', async () => {
    mockLoadEsbuild.mockRejectedValue(new Error('Cannot find module esbuild'));

    await expect(compileConfig('input.ts')).rejects.toThrow('esbuild is required');
  });

  it('chains the original error as cause when esbuild import fails', async () => {
    const importError = new Error('Cannot find module esbuild');
    mockLoadEsbuild.mockRejectedValue(importError);

    const thrownError = await compileConfig('input.ts').catch((error: unknown) => error);
    expect(thrownError).toBeInstanceOf(Error);
    if (thrownError instanceof Error) {
      expect(thrownError.cause).toBe(importError);
    }
  });
});

/** Builds a mock esbuild result with the given output text. */
function buildResult(text: string) {
  return { outputFiles: [{ contents: new TextEncoder().encode(text) }] };
}
