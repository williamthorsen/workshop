import assert from 'node:assert';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RdyManifest } from '../../manifest/manifestSchema.ts';

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
import {
  buildRecordedEntry,
  compileResult,
  ESBUILD_VERSION,
  kitMetadata,
  SRC_DIR,
} from '../test-utils/compile-result-fixtures.ts';
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

  it('upserts manifest entry for single-file compile with location fields', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('deploy.ts', {
        outputPath: '/abs/deploy.js',
        changed: true,
        targetHash: 'deadbeef',
        metadata: kitMetadata({ description: 'Deploy checks' }),
      }),
    );
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'default', description: 'Default checks' }],
    });

    await compile(['deploy.ts']);

    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
      version: 1,
      kits: [
        { name: 'default', description: 'Default checks' },
        {
          esbuildVersion: ESBUILD_VERSION,
          inputs: buildRecordedEntry('../deploy.ts'),
          name: 'deploy',
          description: 'Deploy checks',
          path: expect.stringContaining('deploy.js'),
          readyupVersion: VERSION,
          source: expect.stringContaining('deploy.ts'),
          sourceHash: '5c0urce1',
          targetHash: 'deadbeef',
        },
      ],
    });
  });

  it('creates new manifest for single-file compile when no manifest exists', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('deploy.ts', { outputPath: '/abs/deploy.js', changed: true, targetHash: 'deadbeef' }),
    );
    mockReadManifest.mockImplementation(() => {
      throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
    });

    await compile(['deploy.ts']);

    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
      version: 1,
      kits: [
        {
          esbuildVersion: ESBUILD_VERSION,
          inputs: buildRecordedEntry('../deploy.ts'),
          name: 'deploy',
          path: expect.stringContaining('deploy.js'),
          readyupVersion: VERSION,
          source: expect.stringContaining('deploy.ts'),
          sourceHash: '5c0urce1',
          targetHash: 'deadbeef',
        },
      ],
    });
  });

  it('replaces existing entry when upserting for single-file compile', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('deploy.ts', {
        outputPath: '/abs/deploy.js',
        changed: true,
        targetHash: 'deadbeef',
        metadata: kitMetadata({ description: 'Updated' }),
      }),
    );
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'deploy', description: 'Old' }],
    });

    await compile(['deploy.ts']);

    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
      version: 1,
      kits: [
        {
          esbuildVersion: ESBUILD_VERSION,
          inputs: buildRecordedEntry('../deploy.ts'),
          name: 'deploy',
          description: 'Updated',
          path: expect.stringContaining('deploy.js'),
          readyupVersion: VERSION,
          source: expect.stringContaining('deploy.ts'),
          sourceHash: '5c0urce1',
          targetHash: 'deadbeef',
        },
      ],
    });
  });

  it('skips manifest for single-file compile when --skip-manifest is set', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('input.ts', { outputPath: '/abs/out.js', changed: true, targetHash: 'aaaa1111' }),
    );

    await compile(['input.ts', '--skip-manifest']);

    expect(mockWriteManifest).not.toHaveBeenCalled();
    expect(mockReadManifest).not.toHaveBeenCalled();
  });

  it('writes warning to stderr when upsert encounters non-missing-file error', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('deploy.ts', { outputPath: '/abs/deploy.js', changed: true, targetHash: 'deadbeef' }),
    );
    mockReadManifest.mockImplementation(() => {
      throw new Error('Invalid manifest schema in .readyup/manifest.json: bad data');
    });

    const { stderr } = await compile(['deploy.ts']);

    expect(stderr).toContain('Warning:');
    expect(stderr).toContain('Invalid manifest schema');
    // Still writes the manifest despite the warning
    expect(mockWriteManifest).toHaveBeenCalledTimes(1);
  });

  it('uses custom manifest path from --manifest flag for single-file compile', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('deploy.ts', { outputPath: '/abs/deploy.js', changed: true, targetHash: 'deadbeef' }),
    );
    mockReadManifest.mockImplementation(() => {
      throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
    });

    await compile(['deploy.ts', '--manifest=custom/manifest.json']);

    expect(mockWriteManifest).toHaveBeenCalledTimes(1);
    expect(mockWriteManifest).toHaveBeenCalledWith(expect.stringContaining('custom/manifest.json'), expect.anything());
  });

  it('populates readyupVersion when upserting a single-file compile entry', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('deploy.ts', { outputPath: '/abs/deploy.js', changed: true, targetHash: 'deadbeef' }),
    );
    mockReadManifest.mockImplementation(() => {
      throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
    });

    await compile(['deploy.ts']);

    const [writeManifestCall] = mockWriteManifest.mock.calls;
    assert.ok(writeManifestCall);
    const writtenManifest: RdyManifest = writeManifestCall[1];
    const deployEntry = writtenManifest.kits.find((k) => k.name === 'deploy');
    assert.ok(deployEntry, 'Expected deploy entry to be present');
    expect(deployEntry.readyupVersion).toBe(VERSION);
  });

  it('maintains alphabetical order when upserting manifest entries', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('alpha.ts', { outputPath: '/abs/alpha.js', changed: true, targetHash: 'aaaa1111' }),
    );
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'charlie' }, { name: 'beta' }],
    });

    await compile(['alpha.ts']);

    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
      version: 1,
      kits: [expect.objectContaining({ name: 'alpha' }), { name: 'beta' }, { name: 'charlie' }],
    });
  });
});
