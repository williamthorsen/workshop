import assert from 'node:assert';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import type { RdyManifest } from '../src/manifest/manifestSchema.ts';

const mockCompileConfig = vi.hoisted(() => vi.fn());
const mockValidateCompiledOutput = vi.hoisted(() => vi.fn());
const mockLoadConfig = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockReaddirSync = vi.hoisted(() => vi.fn());
const mockPicomatch = vi.hoisted(() => vi.fn());
const mockWriteManifest = vi.hoisted(() => vi.fn());
const mockReadManifest = vi.hoisted(() => vi.fn());
const mockCheckDrift = vi.hoisted(() => vi.fn());

vi.mock('../src/compile/compileConfig.ts', () => ({
  compileConfig: mockCompileConfig,
}));

vi.mock('../src/compile/validateCompiledOutput.ts', () => ({
  validateCompiledOutput: mockValidateCompiledOutput,
}));

vi.mock('../src/loadConfig.ts', () => ({
  loadConfig: mockLoadConfig,
}));

vi.mock(import('node:fs'), () => ({
  existsSync: mockExistsSync,
  readdirSync: mockReaddirSync,
}));

vi.mock('picomatch', () => ({
  default: mockPicomatch,
}));

vi.mock('../src/manifest/writeManifest.ts', () => ({
  writeManifest: mockWriteManifest,
}));

vi.mock('../src/manifest/readManifest.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/manifest/readManifest.ts')>();
  return {
    ManifestNotFoundError: actual.ManifestNotFoundError,
    readManifest: mockReadManifest,
  };
});

vi.mock('../src/verify/checkDrift.ts', () => ({
  checkDrift: mockCheckDrift,
}));

import { compileCommand } from '../src/compile/compileCommand.ts';
import { ManifestNotFoundError } from '../src/manifest/readManifest.ts';
import { ICON_SKIPPED_NA as ICON_NO_CHANGES } from '../src/reportRdy.ts';

describe(compileCommand, () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockValidateCompiledOutput.mockResolvedValue({});
    mockCheckDrift.mockReturnValue({ kind: 'unverified' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockCompileConfig.mockReset();
    mockValidateCompiledOutput.mockReset();
    mockLoadConfig.mockReset();
    mockExistsSync.mockReset();
    mockReaddirSync.mockReset();
    mockPicomatch.mockReset();
    mockWriteManifest.mockReset();
    mockReadManifest.mockReset();
    mockCheckDrift.mockReset();
  });

  // Explicit input file tests
  it('returns 0 and writes "Compiling kit:" header for single file', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/out.js', changed: true, targetHash: 'aaaa1111' });

    const exitCode = await compileCommand(['input.ts']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', undefined);
    expect(stdoutSpy).toHaveBeenCalledWith('Compiling kit:\n');
  });

  it('shows compiled indicator for a changed single file', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/out.js', changed: true, targetHash: 'aaaa1111' });

    await compileCommand(['input.ts']);

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('📦'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('→'));
  });

  it('shows no-changes indicator for an unchanged single file', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/out.js', changed: false, targetHash: 'aaaa1111' });

    await compileCommand(['input.ts']);

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(ICON_NO_CHANGES));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('no changes'));
  });

  it('passes --output value to compileConfig', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/custom.js', changed: true, targetHash: 'aaaa1111' });

    const exitCode = await compileCommand(['input.ts', '--output', 'custom.js']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', 'custom.js');
  });

  it('passes --output=value inline form to compileConfig', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/custom.js', changed: true, targetHash: 'aaaa1111' });

    const exitCode = await compileCommand(['input.ts', '--output=custom.js']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', 'custom.js');
  });

  it('passes -o value short form to compileConfig', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/custom.js', changed: true, targetHash: 'aaaa1111' });

    const exitCode = await compileCommand(['input.ts', '-o', 'custom.js']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', 'custom.js');
  });

  it('returns 1 when --output is provided without a value', async () => {
    const exitCode = await compileCommand(['input.ts', '--output']);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('--output requires a path argument'));
  });

  it('returns 1 for unknown flags', async () => {
    const exitCode = await compileCommand(['input.ts', '--verbose']);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown option: --verbose'));
  });

  it('returns 1 when compileConfig throws', async () => {
    mockCompileConfig.mockRejectedValue(new Error('esbuild is required'));

    const exitCode = await compileCommand(['input.ts']);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('esbuild is required'));
  });

  it('returns 1 when multiple positional arguments are provided', async () => {
    const exitCode = await compileCommand(['a.ts', 'b.ts']);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Too many arguments'));
  });

  // Batch compile tests
  it('prints "Compiling kits in" header when srcDir equals outDir', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' });

    await compileCommand([]);

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Compiling kits in'));
    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining(' to '));
  });

  it('prints "from ... to ..." header when srcDir differs from outDir', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/dist', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' });

    await compileCommand([]);

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('from'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('to'));
  });

  it('compiles all .ts files and shows per-file status lines', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts', 'b.ts', 'readme.md']);
    mockCompileConfig
      .mockResolvedValueOnce({ outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' })
      .mockResolvedValueOnce({ outputPath: '/abs/b.js', changed: false, targetHash: 'bbbb2222' });

    const exitCode = await compileCommand([]);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledTimes(2);
    // Header + 2 status lines
    expect(stdoutSpy).toHaveBeenCalledTimes(3);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('📦 a.ts → a.js'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`${ICON_NO_CHANGES} b.ts — no changes`));
  });

  it('returns 1 when --output is given without an input file', async () => {
    const exitCode = await compileCommand(['--output', 'out.js']);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('--output requires an input file'));
  });

  it('returns 1 for --all (removed flag)', async () => {
    const exitCode = await compileCommand(['--all']);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown option: --all'));
  });

  it('uses compile.include glob to filter files during batch compile', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: 'shared/*.ts' },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['shared/deploy.ts', 'shared/infra.ts', 'other.ts']);
    const matchFn = vi.fn((name: string) => name.startsWith('shared/'));
    mockPicomatch.mockReturnValue(matchFn);
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' });

    const exitCode = await compileCommand([]);

    expect(exitCode).toBe(0);
    expect(mockPicomatch).toHaveBeenCalledWith('shared/*.ts');
    expect(mockCompileConfig).toHaveBeenCalledTimes(2);
  });

  it('returns 1 when srcDir does not exist', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(false);

    const exitCode = await compileCommand([]);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Source directory not found'));
  });

  it('writes empty manifest and emits info message when srcDir has no .ts files', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['readme.md']);

    const exitCode = await compileCommand([]);

    expect(exitCode).toBe(0);
    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), { version: 1, kits: [] });
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('No .ts files found'));
  });

  it('returns 0 and skips manifest when --skip-manifest is set and srcDir has no .ts files', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['readme.md']);

    const exitCode = await compileCommand(['--skip-manifest']);

    expect(exitCode).toBe(0);
    expect(mockWriteManifest).not.toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('No .ts files found'));
  });

  // Post-compile validation tests
  it('returns 1 when post-compile validation fails for explicit input', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/out.js', changed: true, targetHash: 'aaaa1111' });
    mockValidateCompiledOutput.mockRejectedValue(new Error('Suite name(s) collide with checklist name(s): deploy'));

    const exitCode = await compileCommand(['input.ts']);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Suite name(s) collide'));
  });

  it('returns 1 when post-compile validation fails during batch compile', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' });
    mockValidateCompiledOutput.mockRejectedValue(new Error('suite "ci" references unknown checklist "missing"'));

    const exitCode = await compileCommand([]);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('references unknown checklist'));
  });

  it('returns 1 with structured error when readdirSync throws during batch compile', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const exitCode = await compileCommand([]);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to read source directory'));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('EACCES'));
  });

  it('writes empty manifest when glob matches only non-.ts files during batch compile', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: 'data/*' },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['data/readme.md', 'data/config.json']);
    mockPicomatch.mockReturnValue(() => true);

    const exitCode = await compileCommand([]);

    expect(exitCode).toBe(0);
    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), { version: 1, kits: [] });
  });

  // Manifest generation tests
  it('writes manifest after batch compile with kit entries including location fields', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['alpha.ts', 'beta.ts']);
    mockCompileConfig
      .mockResolvedValueOnce({ outputPath: '/abs/alpha.js', changed: true, targetHash: 'aaaa1111' })
      .mockResolvedValueOnce({ outputPath: '/abs/beta.js', changed: true, targetHash: 'bbbb2222' });
    mockValidateCompiledOutput.mockResolvedValueOnce({ description: 'Alpha checks' }).mockResolvedValueOnce({});

    await compileCommand([]);

    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
      version: 1,
      kits: [
        {
          name: 'alpha',
          description: 'Alpha checks',
          path: expect.stringContaining('alpha.js'),
          source: expect.stringContaining('alpha.ts'),
          targetHash: 'aaaa1111',
        },
        {
          name: 'beta',
          path: expect.stringContaining('beta.js'),
          source: expect.stringContaining('beta.ts'),
          targetHash: 'bbbb2222',
        },
      ],
    });

    // Verify paths are relative (not absolute).
    const writtenManifest: RdyManifest = mockWriteManifest.mock.calls[0][1];
    for (const kit of writtenManifest.kits) {
      assert.ok(kit.path, 'Expected kit.path to be defined');
      assert.ok(kit.source, 'Expected kit.source to be defined');
      expect(kit.path).not.toMatch(/^\//);
      expect(kit.source).not.toMatch(/^\//);
    }
  });

  it('skips manifest generation when --skip-manifest is set', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' });

    await compileCommand(['--skip-manifest']);

    expect(mockWriteManifest).not.toHaveBeenCalled();
  });

  it('uses custom manifest path from --manifest flag', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' });

    await compileCommand(['--manifest=custom/manifest.json']);

    expect(mockWriteManifest).toHaveBeenCalledWith(expect.stringContaining('custom/manifest.json'), expect.anything());
  });

  it('upserts manifest entry for single-file compile with location fields', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/deploy.js', changed: true, targetHash: 'deadbeef' });
    mockValidateCompiledOutput.mockResolvedValue({ description: 'Deploy checks' });
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'default', description: 'Default checks' }],
    });

    await compileCommand(['deploy.ts']);

    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
      version: 1,
      kits: [
        { name: 'default', description: 'Default checks' },
        {
          name: 'deploy',
          description: 'Deploy checks',
          path: expect.stringContaining('deploy.js'),
          source: expect.stringContaining('deploy.ts'),
          targetHash: 'deadbeef',
        },
      ],
    });
  });

  it('creates new manifest for single-file compile when no manifest exists', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/deploy.js', changed: true, targetHash: 'deadbeef' });
    mockValidateCompiledOutput.mockResolvedValue({});
    mockReadManifest.mockImplementation(() => {
      throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
    });

    await compileCommand(['deploy.ts']);

    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
      version: 1,
      kits: [
        {
          name: 'deploy',
          path: expect.stringContaining('deploy.js'),
          source: expect.stringContaining('deploy.ts'),
          targetHash: 'deadbeef',
        },
      ],
    });
  });

  it('replaces existing entry when upserting for single-file compile', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/deploy.js', changed: true, targetHash: 'deadbeef' });
    mockValidateCompiledOutput.mockResolvedValue({ description: 'Updated' });
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'deploy', description: 'Old' }],
    });

    await compileCommand(['deploy.ts']);

    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
      version: 1,
      kits: [
        {
          name: 'deploy',
          description: 'Updated',
          path: expect.stringContaining('deploy.js'),
          source: expect.stringContaining('deploy.ts'),
          targetHash: 'deadbeef',
        },
      ],
    });
  });

  it('skips manifest for single-file compile when --skip-manifest is set', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/out.js', changed: true, targetHash: 'aaaa1111' });

    await compileCommand(['input.ts', '--skip-manifest']);

    expect(mockWriteManifest).not.toHaveBeenCalled();
    expect(mockReadManifest).not.toHaveBeenCalled();
  });

  it('returns 1 when writeManifest throws during batch compile', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' });
    mockWriteManifest.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const exitCode = await compileCommand([]);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Error writing manifest'));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('EACCES'));
  });

  it('writes warning to stderr when upsert encounters non-missing-file error', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/deploy.js', changed: true, targetHash: 'deadbeef' });
    mockValidateCompiledOutput.mockResolvedValue({});
    mockReadManifest.mockImplementation(() => {
      throw new Error('Invalid manifest schema in .readyup/manifest.json: bad data');
    });

    await compileCommand(['deploy.ts']);

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Warning:'));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid manifest schema'));
    // Still writes the manifest despite the warning
    expect(mockWriteManifest).toHaveBeenCalledTimes(1);
  });

  it('uses custom manifest path from --manifest flag for single-file compile', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/deploy.js', changed: true, targetHash: 'deadbeef' });
    mockValidateCompiledOutput.mockResolvedValue({});
    mockReadManifest.mockImplementation(() => {
      throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
    });

    await compileCommand(['deploy.ts', '--manifest=custom/manifest.json']);

    expect(mockWriteManifest).toHaveBeenCalledTimes(1);
    expect(mockWriteManifest).toHaveBeenCalledWith(expect.stringContaining('custom/manifest.json'), expect.anything());
  });

  it('maintains alphabetical order when upserting manifest entries', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/alpha.js', changed: true, targetHash: 'aaaa1111' });
    mockValidateCompiledOutput.mockResolvedValue({});
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'charlie' }, { name: 'beta' }],
    });

    await compileCommand(['alpha.ts']);

    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
      version: 1,
      kits: [expect.objectContaining({ name: 'alpha' }), { name: 'beta' }, { name: 'charlie' }],
    });
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

    const exitCode = await compileCommand(['deploy.ts']);

    expect(exitCode).toBe(1);
    expect(mockCompileConfig).not.toHaveBeenCalled();
    expect(mockWriteManifest).not.toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('⚠️'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('skipped (drift in deploy.js'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('expected aaaa1111, got bbbb2222'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Re-run with --force'));
  });

  it('bypasses drift gate with --force on single-file compile', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/deploy.js', changed: true, targetHash: 'bbbb2222' });
    mockValidateCompiledOutput.mockResolvedValue({});
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

    const exitCode = await compileCommand(['deploy.ts', '--force']);

    expect(exitCode).toBe(0);
    expect(mockCheckDrift).not.toHaveBeenCalled();
    expect(mockCompileConfig).toHaveBeenCalled();
    expect(mockWriteManifest).toHaveBeenCalled();
  });

  it('skips drifted kits during batch compile and preserves their manifest entries', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
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
    mockCompileConfig.mockResolvedValueOnce({ outputPath: '/abs/beta.js', changed: true, targetHash: 'bbbb2222' });

    const exitCode = await compileCommand([]);

    expect(exitCode).toBe(1);
    expect(mockCompileConfig).toHaveBeenCalledTimes(1); // only beta compiled
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('⚠️  alpha.ts — skipped'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('1 of 2 kits skipped due to drift'));

    const writtenManifest: RdyManifest = mockWriteManifest.mock.calls[0][1];
    const alphaEntry = writtenManifest.kits.find((k) => k.name === 'alpha');
    assert.ok(alphaEntry, 'Expected alpha entry to remain in manifest');
    expect(alphaEntry.targetHash).toBe('aaaa1111');
    const betaEntry = writtenManifest.kits.find((k) => k.name === 'beta');
    assert.ok(betaEntry, 'Expected beta entry to be present');
    expect(betaEntry.targetHash).toBe('bbbb2222');
  });

  it('compiles all kits when --force is passed during batch compile with drift', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
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
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/alpha.js', changed: true, targetHash: 'aaaa9999' });

    const exitCode = await compileCommand(['--force']);

    expect(exitCode).toBe(0);
    expect(mockCheckDrift).not.toHaveBeenCalled();
    expect(mockCompileConfig).toHaveBeenCalledTimes(1);
    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('skipped due to drift'));
  });

  it('does not emit drift footer when no kits were skipped', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCheckDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' });

    await compileCommand([]);

    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('skipped due to drift'));
  });
});
