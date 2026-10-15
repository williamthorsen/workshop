import { realpathSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VERSION } from '../../version.ts';
import { KIT_COMPILE_TARGET, KIT_TSCONFIG } from '../buildBundle.ts';
import { compileConfig } from '../compileConfig.ts';

const mockBuild = vi.hoisted(() => vi.fn());
const mockBuildInstallCommand = vi.hoisted(() => vi.fn());
const mockLoadEsbuild = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockMkdirSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockRenameSync = vi.hoisted(() => vi.fn());
const mockRmSync = vi.hoisted(() => vi.fn());
const mockValidateCompiledOutput = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());

vi.mock(import('../loadEsbuild.ts'), () => ({
  loadEsbuild: mockLoadEsbuild,
}));

vi.mock(import('../../portable/buildInstallCommand.ts'), () => ({
  buildInstallCommand: mockBuildInstallCommand,
}));

// Spread the original so that `realpathSync`, which the compile root is resolved through, stays real.
vi.mock(import('node:fs'), async (importOriginal) => ({
  ...(await importOriginal()),
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  readFileSync: mockReadFileSync,
  renameSync: mockRenameSync,
  rmSync: mockRmSync,
  writeFileSync: mockWriteFileSync,
}));

vi.mock(import('../validateCompiledOutput.ts'), () => ({
  validateCompiledOutput: mockValidateCompiledOutput,
}));

// Names a directory that exists whatever the working directory is, because the compile root is resolved
// through `realpathSync` of the entry's own directory once `existsSync` reports no `package.json` above it.
const CONFIG_PATH = path.join(import.meta.dirname, 'readyup.config.ts');

const KIT_METADATA = {
  checklistChecks: [{ checklist: 'default', checks: [] }],
  checklists: ['default'],
  description: undefined,
};

const OUTPUT_PATH = path.resolve('input.js');
const STAGED_PATH = expect.stringMatching(/\/\.input\.[\da-f-]{36}\.tmp\.js$/);

describe(compileConfig, () => {
  beforeEach(() => {
    // Default: The esbuild import succeeds and exposes the mocked `build`.
    // Failure-path tests override this with `mockRejectedValue`.
    mockLoadEsbuild.mockResolvedValue({ build: mockBuild, version: '0.99.0-test' });
    mockValidateCompiledOutput.mockResolvedValue(KIT_METADATA);
  });

  afterEach(() => {
    mockBuild.mockReset();
    mockBuildInstallCommand.mockReset();
    mockLoadEsbuild.mockReset();
    mockExistsSync.mockReset();
    mockMkdirSync.mockReset();
    mockReadFileSync.mockReset();
    mockRenameSync.mockReset();
    mockRmSync.mockReset();
    mockValidateCompiledOutput.mockReset();
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
      plugins: [
        expect.objectContaining({ name: 'pick-json' }),
        expect.objectContaining({ name: 'externalize-readyup' }),
      ],
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

  it('stages, validates, and renames the bundle onto the output when no existing file exists', async () => {
    mockBuild.mockResolvedValue(buildResult('compiled'));
    mockExistsSync.mockReturnValue(false);

    const result = await compileConfig('input.ts');

    expect(result.changed).toBe(true);
    expect(result.metadata).toBe(KIT_METADATA);
    expect(mockMkdirSync).toHaveBeenCalledWith(path.dirname(OUTPUT_PATH), { recursive: true });
    expect(mockWriteFileSync).toHaveBeenCalledWith(STAGED_PATH, expect.any(Buffer));
    expect(mockValidateCompiledOutput).toHaveBeenCalledWith(STAGED_PATH, OUTPUT_PATH);
    expect(mockRenameSync).toHaveBeenCalledWith(STAGED_PATH, OUTPUT_PATH);
  });

  it('renames the staged bundle onto the output and returns changed: true when the existing file differs', async () => {
    mockBuild.mockResolvedValue(buildResult('new content'));
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(Buffer.from('old content'));

    const result = await compileConfig('input.ts');

    expect(result.changed).toBe(true);
    expect(mockRenameSync).toHaveBeenCalledWith(STAGED_PATH, OUTPUT_PATH);
  });

  it('validates but leaves the output alone and returns changed: false when the existing file is identical', async () => {
    const content = 'identical content';
    mockBuild.mockResolvedValue(buildResult(content));
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(Buffer.from(content));

    const result = await compileConfig('input.ts');

    expect(result.changed).toBe(false);
    expect(mockValidateCompiledOutput).toHaveBeenCalledWith(STAGED_PATH, OUTPUT_PATH);
    expect(mockRenameSync).not.toHaveBeenCalled();
    expect(mockRmSync).toHaveBeenCalledWith(STAGED_PATH, { force: true });
  });

  it('leaves the existing output untouched and removes the staged bundle when validation fails', async () => {
    mockBuild.mockResolvedValue(buildResult('invalid kit'));
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(Buffer.from('previous kit'));
    mockValidateCompiledOutput.mockRejectedValue(new Error('Kit file must export checklists'));

    await expect(compileConfig('input.ts')).rejects.toThrow('Kit file must export checklists');

    expect(mockWriteFileSync).not.toHaveBeenCalledWith(OUTPUT_PATH, expect.anything());
    expect(mockRenameSync).not.toHaveBeenCalled();
    expect(mockRmSync).toHaveBeenCalledTimes(1);
    expect(mockRmSync).toHaveBeenCalledWith(STAGED_PATH, { force: true });
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

  it("names the project's package manager in the esbuild install hint", async () => {
    mockBuildInstallCommand.mockReturnValue('npm install --save-dev esbuild');
    mockLoadEsbuild.mockRejectedValue(new Error('Cannot find module esbuild'));

    await expect(compileConfig('input.ts')).rejects.toThrow('Install it with: npm install --save-dev esbuild');
    expect(mockBuildInstallCommand).toHaveBeenCalledWith('esbuild');
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
