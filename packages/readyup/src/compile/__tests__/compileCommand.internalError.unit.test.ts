import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCompileConfig = vi.hoisted(() => vi.fn());
const mockLoadConfig = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockReaddirSync = vi.hoisted(() => vi.fn());
const mockRealpathSync = vi.hoisted(() => Object.assign(vi.fn(), { native: vi.fn() }));
const mockWriteManifest = vi.hoisted(() => vi.fn());
const mockReadManifest = vi.hoisted(() => vi.fn());

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

import { ManifestNotFoundError } from '../../manifest/readManifest.ts';
import { compileCommand } from '../compileCommand.ts';
import { compileResult, kitSource, SRC_DIR } from '../test-utils/compile-result-fixtures.ts';
import { compileRaising } from '../test-utils/compile-runners.ts';

describe(compileCommand, () => {
  beforeEach(() => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: SRC_DIR, outDir: SRC_DIR, include: undefined, exclude: [] },
    });
    mockReadManifest.mockImplementation(() => {
      throw new ManifestNotFoundError('.readyup/manifest.json');
    });
    // No path named by these tests contains a symlink, so a real path is the path itself.
    mockRealpathSync.mockImplementation((target: string) => target);
  });

  afterEach(() => {
    mockCompileConfig.mockReset();
    mockLoadConfig.mockReset();
    mockExistsSync.mockReset();
    mockReaddirSync.mockReset();
    mockRealpathSync.mockReset();
    mockWriteManifest.mockReset();
    mockReadManifest.mockReset();
  });

  // Each compile reports a closure built from another module, so that it records no input for its entry point.
  it('raises an internal error from a single-file compile whose closure omits its entry point', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('other.ts', { outputPath: '/abs/deploy.js', changed: true, targetHash: 'deadbeef' }),
    );

    const { error } = await compileRaising(['deploy.ts']);

    expect(error.code).toBe('internal');
    expect(error.message).toContain('Compile recorded no input for its entry point');
    expect(mockWriteManifest).not.toHaveBeenCalled();
  });

  it('raises an internal error from a project sweep whose closure omits a kit entry point', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('other.ts'), { outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' }),
    );

    const { error } = await compileRaising([]);

    expect(error.code).toBe('internal');
    expect(error.message).toContain('Compile recorded no input for its entry point');
    expect(mockWriteManifest).not.toHaveBeenCalled();
  });
});
