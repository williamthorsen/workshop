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

import { compileCommand } from '../compileCommand.ts';
import { compileResult, SRC_DIR } from '../test-utils/compile-result-fixtures.ts';
import { compile, compileRaising } from '../test-utils/compile-runners.ts';

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

  it('passes --output value to compileConfig', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('input.ts', { outputPath: '/abs/custom.js', changed: true, targetHash: 'aaaa1111' }),
    );

    const { exitCode } = await compile(['input.ts', '--output', 'custom.js']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', 'custom.js');
  });

  it('passes --output=value inline form to compileConfig', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('input.ts', { outputPath: '/abs/custom.js', changed: true, targetHash: 'aaaa1111' }),
    );

    const { exitCode } = await compile(['input.ts', '--output=custom.js']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', 'custom.js');
  });

  it('passes -o value short form to compileConfig', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('input.ts', { outputPath: '/abs/custom.js', changed: true, targetHash: 'aaaa1111' }),
    );

    const { exitCode } = await compile(['input.ts', '-o', 'custom.js']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', 'custom.js');
  });

  it('reports a usage error when --output is provided without a value', async () => {
    const { error } = await compileRaising(['input.ts', '--output']);

    expect(error.code).toBe('usage');
    expect(error.message).toContain('--output requires a path argument');
  });

  it('reports a usage error when --output is given an empty value', async () => {
    const { error } = await compileRaising(['input.ts', '--output=']);

    expect(error.code).toBe('usage');
    expect(error.message).toContain('--output requires a path argument');
  });

  it('reports a usage error for unknown flags', async () => {
    const { error } = await compileRaising(['input.ts', '--verbose']);

    expect(error.code).toBe('usage');
    expect(error.message).toContain("Unknown option '--verbose'");
  });

  it('reports a usage error when multiple positional arguments are provided', async () => {
    const { error } = await compileRaising(['a.ts', 'b.ts']);

    expect(error.code).toBe('usage');
    expect(error.message).toContain('Too many arguments');
  });

  it('reports a usage error when --config is given an empty value', async () => {
    const { error } = await compileRaising(['--config=']);

    expect(error.code).toBe('usage');
    expect(error.message).toContain('--config requires a path argument');
  });

  it('reports a usage error when --output is given without an input file', async () => {
    const { error } = await compileRaising(['--output', 'out.js']);

    expect(error.code).toBe('usage');
    expect(error.message).toContain('--output requires an input file');
  });

  it('reports a usage error for --all (removed flag)', async () => {
    const { error } = await compileRaising(['--all']);

    expect(error.code).toBe('usage');
    expect(error.message).toContain("Unknown option '--all'");
  });
});
