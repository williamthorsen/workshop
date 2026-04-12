import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mockBuild = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockMkdirSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());

vi.mock('esbuild', () => ({
  build: mockBuild,
}));

vi.mock(import('node:fs'), () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}));

import { compileConfig } from '../src/compile/compileConfig.ts';

/** Build a mock esbuild result with the given output text. */
function buildResult(text: string) {
  return { outputFiles: [{ contents: new TextEncoder().encode(text) }] };
}

describe(compileConfig, () => {
  afterEach(() => {
    mockBuild.mockReset();
    mockExistsSync.mockReset();
    mockMkdirSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
  });

  it('invokes esbuild with write: false and no outfile', async () => {
    mockBuild.mockResolvedValue(buildResult('compiled'));
    mockExistsSync.mockReturnValue(false);

    await compileConfig('config/rdy.config.ts');

    expect(mockBuild).toHaveBeenCalledWith({
      entryPoints: [path.resolve('config/rdy.config.ts')],
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'es2022',
      external: ['node:*'],
      plugins: [expect.objectContaining({ name: 'pick-json' })],
      banner: { js: expect.stringContaining('@generated') },
      write: false,
    });
  });

  it('returns the resolved output path', async () => {
    mockBuild.mockResolvedValue(buildResult('compiled'));
    mockExistsSync.mockReturnValue(false);

    const result = await compileConfig('config/rdy.config.ts');

    expect(result.outputPath).toBe(path.resolve('config/rdy.config.js'));
  });

  it('uses a custom output path when provided', async () => {
    mockBuild.mockResolvedValue(buildResult('compiled'));
    mockExistsSync.mockReturnValue(false);

    const result = await compileConfig('config/rdy.config.ts', 'dist/bundle.js');

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
    vi.doMock('esbuild', () => {
      throw new Error('Cannot find module esbuild');
    });
    vi.resetModules();

    const { compileConfig: freshCompile } = await import('../src/compile/compileConfig.ts');

    await expect(freshCompile('input.ts')).rejects.toThrow('esbuild is required');

    // Restore the mock for subsequent tests
    vi.doMock('esbuild', () => ({ build: mockBuild }));
    vi.resetModules();
  });

  it('chains the original error as cause when esbuild import fails', async () => {
    vi.doMock('esbuild', () => {
      throw new Error('Cannot find module esbuild');
    });
    vi.resetModules();

    const { compileConfig: freshCompile } = await import('../src/compile/compileConfig.ts');

    const thrownError = await freshCompile('input.ts').catch((error: unknown) => error);
    expect(thrownError).toBeInstanceOf(Error);
    if (thrownError instanceof Error) {
      expect(thrownError.cause).toBeInstanceOf(Error);
    }

    // Restore the mock for subsequent tests
    vi.doMock('esbuild', () => ({ build: mockBuild }));
    vi.resetModules();
  });
});
