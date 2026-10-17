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

import { richFormatter } from '../../layout/formatter.ts';
import { compileCommand } from '../compileCommand.ts';
import { compileResult, kitSource, SRC_DIR } from '../test-utils/compile-result-fixtures.ts';
import { compile } from '../test-utils/compile-runners.ts';

const ICON_DRIFT = richFormatter.tokens.failedWarn.text;

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

  // Drift-gate tests
  it('skips single-file compile with drift and returns 1 without invoking compileConfig', async () => {
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'deploy', path: 'deploy.js', targetHash: 'aaaa1111' }],
    });
    mockCheckDrift.mockReturnValue({
      kind: 'drift',
      expected: 'aaaa1111',
      actual: 'bbbb2222',
      resolvedPath: '/abs/deploy.js',
    });

    const { exitCode, stdout } = await compile(['deploy.ts']);

    expect(exitCode).toBe(1);
    expect(mockCompileConfig).not.toHaveBeenCalled();
    expect(mockWriteManifest).not.toHaveBeenCalled();
    expect(stdout).toContain(`${ICON_DRIFT} deploy.ts\n   drift in deploy.js: expected aaaa1111, got bbbb2222\n`);
    expect(stdout).toContain('Re-run with --force');
  });

  it('bypasses drift gate with --force on single-file compile', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('deploy.ts', { outputPath: '/abs/deploy.js', changed: true, targetHash: 'bbbb2222' }),
    );
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'deploy', path: 'deploy.js', targetHash: 'aaaa1111' }],
    });
    mockCheckDrift.mockReturnValue({
      kind: 'drift',
      expected: 'aaaa1111',
      actual: 'bbbb2222',
      resolvedPath: '/abs/deploy.js',
    });

    const { exitCode } = await compile(['deploy.ts', '--force']);

    expect(exitCode).toBe(0);
    expect(mockCheckDrift).not.toHaveBeenCalled();
    expect(mockCompileConfig).toHaveBeenCalledTimes(1);
    expect(mockWriteManifest).toHaveBeenCalledTimes(1);
  });

  it('skips drifted kits during batch compile and preserves their manifest entries', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['alpha.ts', 'beta.ts']);
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [
        { name: 'alpha', path: 'alpha.js', source: 'alpha.ts', targetHash: 'aaaa1111' },
        { name: 'beta', path: 'beta.js', source: 'beta.ts', targetHash: 'bbbb0000' },
      ],
    });
    // alpha drifts; beta is ok.
    mockCheckDrift
      .mockReturnValueOnce({
        kind: 'drift',
        expected: 'aaaa1111',
        actual: 'aaaa9999',
        resolvedPath: '/abs/alpha.js',
      })
      .mockReturnValueOnce({ kind: 'ok', targetHash: 'bbbb0000' });
    mockCompileConfig.mockResolvedValueOnce(
      compileResult(kitSource('beta.ts'), { outputPath: '/abs/beta.js', changed: true, targetHash: 'bbbb2222' }),
    );

    const { exitCode, stdout } = await compile([]);

    expect(exitCode).toBe(1);
    expect(mockCompileConfig).toHaveBeenCalledTimes(1); // only beta compiled
    expect(stdout).toContain(`${ICON_DRIFT} alpha.ts\n   drift in alpha.js:`);
    expect(stdout).toContain('1 of 2 kits skipped due to drift');

    const [writeManifestCall] = mockWriteManifest.mock.calls;
    assert.ok(writeManifestCall);
    const writtenManifest: RdyManifest = writeManifestCall[1];
    const alphaEntry = writtenManifest.kits.find((k) => k.name === 'alpha');
    assert.ok(alphaEntry, 'Expected alpha entry to remain in manifest');
    expect(alphaEntry.targetHash).toBe('aaaa1111');
    const betaEntry = writtenManifest.kits.find((k) => k.name === 'beta');
    assert.ok(betaEntry, 'Expected beta entry to be present');
    expect(betaEntry.targetHash).toBe('bbbb2222');
  });

  it('compiles all kits when --force is passed during batch compile with drift', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['alpha.ts']);
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'alpha', path: 'alpha.js', source: 'alpha.ts', targetHash: 'aaaa1111' }],
    });
    mockCheckDrift.mockReturnValue({
      kind: 'drift',
      expected: 'aaaa1111',
      actual: 'aaaa9999',
      resolvedPath: '/abs/alpha.js',
    });
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('alpha.ts'), { outputPath: '/abs/alpha.js', changed: true, targetHash: 'aaaa9999' }),
    );

    const { exitCode, stdout } = await compile(['--force']);

    expect(exitCode).toBe(0);
    expect(mockCheckDrift).not.toHaveBeenCalled();
    expect(mockCompileConfig).toHaveBeenCalledTimes(1);
    expect(stdout).not.toContain('skipped due to drift');
  });

  it('does not emit drift footer when no kits were skipped', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCheckDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('a.ts'), { outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' }),
    );

    const { stdout } = await compile([]);

    expect(stdout).not.toContain('skipped due to drift');
  });
});
