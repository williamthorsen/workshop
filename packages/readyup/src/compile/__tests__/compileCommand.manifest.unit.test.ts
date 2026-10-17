import assert from 'node:assert';
import path from 'node:path';

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
  kitSource,
  SOURCE_HASH,
  SRC_DIR,
} from '../test-utils/compile-result-fixtures.ts';
import { compile, compileRaising } from '../test-utils/compile-runners.ts';
import type { KitMetadata } from '../validateCompiledOutput.ts';

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

  describe('manifest checklist names', () => {
    it('records the checklist names and check names declared by the compiled kit', async () => {
      mockCompileConfig.mockResolvedValue(
        compileResult('deploy.ts', {
          outputPath: '/abs/deploy.js',
          changed: true,
          targetHash: 'aaaa1111',
          metadata: kitMetadata({
            checklistChecks: [
              { checklist: 'preflight', checks: ['Node.js runtime is v24 or later'] },
              { checklist: 'deploy', checks: [] },
            ],
            checklists: ['preflight', 'deploy'],
          }),
        }),
      );
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('missing');
      });

      await compile(['deploy.ts']);

      expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
        version: 1,
        kits: [
          expect.objectContaining({
            name: 'deploy',
            checklistChecks: [
              { checklist: 'preflight', checks: ['Node.js runtime is v24 or later'] },
              { checklist: 'deploy', checks: [] },
            ],
            checklists: ['preflight', 'deploy'],
          }),
        ],
      });
    });

    it('omits the field for a kit with no checklists to record', async () => {
      mockCompileConfig.mockResolvedValue(
        compileResult('deploy.ts', { outputPath: '/abs/deploy.js', changed: true, targetHash: 'aaaa1111' }),
      );
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('missing');
      });

      await compile(['deploy.ts']);

      const [call] = mockWriteManifest.mock.calls;
      assert.ok(call);
      const manifest: RdyManifest = call[1];

      expect(manifest.kits[0]).not.toHaveProperty('checklists');
      expect(manifest.kits[0]).not.toHaveProperty('checklistChecks');
    });
  });

  describe('manifest toolchain record', () => {
    it('records bundled dependencies on the entry when the compile reports them', async () => {
      mockCompileConfig.mockResolvedValue({
        ...compileResult('deploy.ts', { outputPath: '/abs/deploy.js', changed: true, targetHash: 'aaaa1111' }),
        bundledDependencies: { picomatch: '4.0.2', zod: '4.0.5' },
      });
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('missing');
      });

      await compile(['deploy.ts']);

      expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
        version: 1,
        kits: [expect.objectContaining({ bundledDependencies: { picomatch: '4.0.2', zod: '4.0.5' } })],
      });
    });

    it('omits the bundledDependencies field for a kit that bundles nothing', async () => {
      mockCompileConfig.mockResolvedValue(
        compileResult('deploy.ts', { outputPath: '/abs/deploy.js', changed: true, targetHash: 'aaaa1111' }),
      );
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('missing');
      });

      await compile(['deploy.ts']);

      const [call] = mockWriteManifest.mock.calls;
      assert.ok(call);
      const manifest: RdyManifest = call[1];

      expect(manifest.kits[0]).not.toHaveProperty('bundledDependencies');
    });
  });

  // Manifest generation tests
  it('writes manifest after batch compile with kit entries including location fields', async () => {
    arrangeTwoKitBatch({ alphaMetadata: kitMetadata({ description: 'Alpha checks' }) });

    await compile([]);

    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
      version: 1,
      kits: [
        {
          esbuildVersion: ESBUILD_VERSION,
          inputs: buildRecordedEntry('kits/alpha.ts'),
          name: 'alpha',
          description: 'Alpha checks',
          path: expect.stringContaining('alpha.js'),
          readyupVersion: VERSION,
          source: expect.stringContaining('alpha.ts'),
          sourceHash: '5c0urce1',
          targetHash: 'aaaa1111',
        },
        {
          esbuildVersion: ESBUILD_VERSION,
          inputs: buildRecordedEntry('kits/beta.ts'),
          name: 'beta',
          path: expect.stringContaining('beta.js'),
          readyupVersion: VERSION,
          source: expect.stringContaining('beta.ts'),
          sourceHash: '5c0urce1',
          targetHash: 'bbbb2222',
        },
      ],
    });

    // Verify paths are relative (not absolute).
    const [writeManifestCall] = mockWriteManifest.mock.calls;
    assert.ok(writeManifestCall);
    const writtenManifest: RdyManifest = writeManifestCall[1];
    for (const kit of writtenManifest.kits) {
      assert.ok(kit.path, 'Expected kit.path to be defined');
      assert.ok(kit.source, 'Expected kit.source to be defined');
      expect(kit.path).not.toMatch(/^\//);
      expect(kit.source).not.toMatch(/^\//);
    }
  });

  it('skips manifest generation when --skip-manifest is set', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('a.ts'), { outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' }),
    );

    await compile(['--skip-manifest']);

    expect(mockWriteManifest).not.toHaveBeenCalled();
  });

  it('uses custom manifest path from --manifest flag', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('a.ts'), { outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' }),
    );

    await compile(['--manifest=custom/manifest.json']);

    expect(mockWriteManifest).toHaveBeenCalledWith(expect.stringContaining('custom/manifest.json'), expect.anything());
  });

  it('records an inlined JSON file with the specifier that produced its projection', async () => {
    const result = compileResult('deploy.ts', {
      outputPath: '/abs/deploy.js',
      changed: true,
      targetHash: 'deadbeef',
    });
    result.inputs.push({
      hash: '1nl1n3d0',
      kind: 'inline',
      path: path.resolve('package.json'),
      paths: ['version', ['engines', 'node']],
    });
    mockCompileConfig.mockResolvedValue(result);
    mockReadManifest.mockImplementation(() => {
      throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
    });

    await compile(['deploy.ts']);

    expect(mockWriteManifest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        kits: [
          expect.objectContaining({
            inputs: [
              { hash: SOURCE_HASH, kind: 'module', path: '../deploy.ts' },
              { hash: '1nl1n3d0', kind: 'inline', path: '../package.json', paths: ['version', ['engines', 'node']] },
            ],
          }),
        ],
      }),
    );
  });

  it('takes the source hash of a single-file compile from the entry point record', async () => {
    const result = compileResult(
      'deploy.ts',
      { outputPath: '/abs/deploy.js', changed: true, targetHash: 'deadbeef' },
      'e47r1e50',
    );
    mockCompileConfig.mockResolvedValue(result);
    mockReadManifest.mockImplementation(() => {
      throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
    });

    await compile(['deploy.ts']);

    expect(mockWriteManifest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ kits: [expect.objectContaining({ sourceHash: 'e47r1e50' })] }),
    );
  });

  it('records a distinct source hash per kit in a batch compile', async () => {
    arrangeTwoKitBatch({ alphaHash: 'a1a1a1a1', betaHash: 'b2b2b2b2' });

    await compile([]);

    const [writeManifestCall] = mockWriteManifest.mock.calls;
    assert.ok(writeManifestCall);
    const writtenManifest: RdyManifest = writeManifestCall[1];
    expect(writtenManifest.kits.map((kit) => kit.sourceHash)).toStrictEqual(['a1a1a1a1', 'b2b2b2b2']);
  });

  it('leaves a drift-skipped kit its prior entry, source hash included', async () => {
    arrangeTwoKitBatch();
    const recordedAlpha = {
      name: 'alpha',
      path: 'alpha.js',
      readyupVersion: VERSION,
      source: 'alpha.ts',
      sourceHash: '0ld50urc',
      targetHash: 'aaaa1111',
    };
    mockReadManifest.mockReturnValue({ version: 1, kits: [recordedAlpha] });
    mockCheckDrift.mockImplementation((kit: { name: string }) =>
      kit.name === 'alpha'
        ? { kind: 'drift', expected: 'aaaa1111', actual: 'ffff9999', resolvedPath: '/abs/alpha.js' }
        : { kind: 'unverified' },
    );

    await compile([]);

    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
      version: 1,
      kits: [recordedAlpha, expect.objectContaining({ name: 'beta' })],
    });
  });

  it('reports a config error when writeManifest throws during batch compile', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('a.ts'), { outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' }),
    );
    mockWriteManifest.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const { error } = await compileRaising([]);

    expect(error.code).toBe('config');
    expect(error.message).toContain('Error writing manifest');
    expect(error.message).toContain('EACCES');
  });

  it('populates readyupVersion from the runner version on every batch-compile entry', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['alpha.ts', 'beta.ts']);
    mockCompileConfig
      .mockResolvedValueOnce(
        compileResult(kitSource('alpha.ts'), { outputPath: '/abs/alpha.js', changed: true, targetHash: 'aaaa1111' }),
      )
      .mockResolvedValueOnce(
        compileResult(kitSource('beta.ts'), { outputPath: '/abs/beta.js', changed: true, targetHash: 'bbbb2222' }),
      );

    await compile([]);

    const [writeManifestCall] = mockWriteManifest.mock.calls;
    assert.ok(writeManifestCall);
    const writtenManifest: RdyManifest = writeManifestCall[1];
    for (const kit of writtenManifest.kits) {
      expect(kit.readyupVersion).toBe(VERSION);
    }
  });

  it('warns on stderr when the existing manifest is unreadable during batch compile', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['alpha.ts']);
    mockReadManifest.mockImplementation(() => {
      throw new Error('Unexpected token in JSON at position 0');
    });
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('alpha.ts'), { outputPath: '/abs/alpha.js', changed: true, targetHash: 'aaaa1111' }),
    );

    const { stderr } = await compile([]);

    expect(stderr).toContain('Unexpected token in JSON');
    expect(stderr).toContain('drift gate skipped');
  });

  it('is silent when the manifest is missing during batch compile', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['alpha.ts']);
    mockReadManifest.mockImplementation(() => {
      throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
    });
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('alpha.ts'), { outputPath: '/abs/alpha.js', changed: true, targetHash: 'aaaa1111' }),
    );

    const { stderr } = await compile([]);

    expect(stderr).not.toContain('drift gate skipped');
  });

  // region | Helpers

  /** Arranges a two-kit batch in which both kits compile successfully. */
  function arrangeTwoKitBatch(
    options: { alphaHash?: string; alphaMetadata?: KitMetadata; betaHash?: string } = {},
  ): void {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: SRC_DIR, outDir: SRC_DIR, include: undefined, exclude: [] },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['alpha.ts', 'beta.ts']);
    // Keyed by the source rather than queued, so that the next kit does not receive the result of a kit skipped by the sweep.
    mockCompileConfig.mockImplementation((inputPath: string) => {
      const isAlpha = path.basename(inputPath) === 'alpha.ts';
      const result = isAlpha
        ? { outputPath: '/abs/alpha.js', changed: true, targetHash: 'aaaa1111', metadata: options.alphaMetadata }
        : { outputPath: '/abs/beta.js', changed: true, targetHash: 'bbbb2222' };

      return Promise.resolve(compileResult(inputPath, result, isAlpha ? options.alphaHash : options.betaHash));
    });
  }

  // endregion | Helpers
});
