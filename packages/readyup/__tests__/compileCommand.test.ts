import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

const mockCompileConfig = vi.hoisted(() => vi.fn());
const mockValidateCompiledOutput = vi.hoisted(() => vi.fn());
const mockLoadConfig = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockReaddirSync = vi.hoisted(() => vi.fn());
const mockPicomatch = vi.hoisted(() => vi.fn());
const mockWriteManifest = vi.hoisted(() => vi.fn());
const mockReadManifest = vi.hoisted(() => vi.fn());

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

vi.mock('../src/manifest/readManifest.ts', () => ({
  readManifest: mockReadManifest,
}));

import { compileCommand } from '../src/compile/compileCommand.ts';
import { ICON_SKIPPED_NA as ICON_NO_CHANGES } from '../src/reportRdy.ts';

describe(compileCommand, () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockValidateCompiledOutput.mockResolvedValue({});
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
  });

  // Explicit input file tests
  it('returns 0 and writes "Compiling kit:" header for single file', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/out.js', changed: true });

    const exitCode = await compileCommand(['input.ts']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', undefined);
    expect(stdoutSpy).toHaveBeenCalledWith('Compiling kit:\n');
  });

  it('shows compiled indicator for a changed single file', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/out.js', changed: true });

    await compileCommand(['input.ts']);

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('📦'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('→'));
  });

  it('shows no-changes indicator for an unchanged single file', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/out.js', changed: false });

    await compileCommand(['input.ts']);

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(ICON_NO_CHANGES));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('no changes'));
  });

  it('passes --output value to compileConfig', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/custom.js', changed: true });

    const exitCode = await compileCommand(['input.ts', '--output', 'custom.js']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', 'custom.js');
  });

  it('passes --output=value inline form to compileConfig', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/custom.js', changed: true });

    const exitCode = await compileCommand(['input.ts', '--output=custom.js']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', 'custom.js');
  });

  it('passes -o value short form to compileConfig', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/custom.js', changed: true });

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
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/a.js', changed: true });

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
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/a.js', changed: true });

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
      .mockResolvedValueOnce({ outputPath: '/abs/a.js', changed: true })
      .mockResolvedValueOnce({ outputPath: '/abs/b.js', changed: false });

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
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/a.js', changed: true });

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

  it('returns 1 when srcDir has no .ts files', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['readme.md']);

    const exitCode = await compileCommand([]);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('No .ts files found'));
  });

  // Post-compile validation tests
  it('returns 1 when post-compile validation fails for explicit input', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/out.js', changed: true });
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
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/a.js', changed: true });
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

  it('returns 1 when glob matches only non-.ts files during batch compile', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: 'data/*' },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['data/readme.md', 'data/config.json']);
    mockPicomatch.mockReturnValue(() => true);

    const exitCode = await compileCommand([]);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('No .ts files found'));
  });

  // Manifest generation tests
  it('writes manifest after batch compile with kit entries', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['alpha.ts', 'beta.ts']);
    mockCompileConfig
      .mockResolvedValueOnce({ outputPath: '/abs/alpha.js', changed: true })
      .mockResolvedValueOnce({ outputPath: '/abs/beta.js', changed: true });
    mockValidateCompiledOutput.mockResolvedValueOnce({ description: 'Alpha checks' }).mockResolvedValueOnce({});

    await compileCommand([]);

    expect(mockWriteManifest).toHaveBeenCalledTimes(1);
    const [, manifest] = mockWriteManifest.mock.calls[0] as [
      string,
      { version: number; kits: Array<{ name: string; description?: string }> },
    ];
    expect(manifest.version).toBe(1);
    expect(manifest.kits).toStrictEqual([{ name: 'alpha', description: 'Alpha checks' }, { name: 'beta' }]);
  });

  it('skips manifest generation when --skip-manifest is set', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/a.js', changed: true });

    await compileCommand(['--skip-manifest']);

    expect(mockWriteManifest).not.toHaveBeenCalled();
  });

  it('uses custom manifest path from --manifest flag', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/a.js', changed: true });

    await compileCommand(['--manifest=custom/manifest.json']);

    expect(mockWriteManifest).toHaveBeenCalledTimes(1);
    const [manifestPath] = mockWriteManifest.mock.calls[0] as [string];
    expect(manifestPath).toContain('custom/manifest.json');
  });

  it('upserts manifest entry for single-file compile', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/deploy.js', changed: true });
    mockValidateCompiledOutput.mockResolvedValue({ description: 'Deploy checks' });
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'default', description: 'Default checks' }],
    });

    await compileCommand(['deploy.ts']);

    expect(mockWriteManifest).toHaveBeenCalledTimes(1);
    const [, manifest] = mockWriteManifest.mock.calls[0] as [
      string,
      { version: number; kits: Array<{ name: string; description?: string }> },
    ];
    expect(manifest.kits).toStrictEqual([
      { name: 'default', description: 'Default checks' },
      { name: 'deploy', description: 'Deploy checks' },
    ]);
  });

  it('creates new manifest for single-file compile when no manifest exists', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/deploy.js', changed: true });
    mockValidateCompiledOutput.mockResolvedValue({});
    mockReadManifest.mockImplementation(() => {
      throw new Error('not found');
    });

    await compileCommand(['deploy.ts']);

    expect(mockWriteManifest).toHaveBeenCalledTimes(1);
    const [, manifest] = mockWriteManifest.mock.calls[0] as [
      string,
      { version: number; kits: Array<{ name: string }> },
    ];
    expect(manifest.kits).toStrictEqual([{ name: 'deploy' }]);
  });

  it('replaces existing entry when upserting for single-file compile', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/deploy.js', changed: true });
    mockValidateCompiledOutput.mockResolvedValue({ description: 'Updated' });
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'deploy', description: 'Old' }],
    });

    await compileCommand(['deploy.ts']);

    const [, manifest] = mockWriteManifest.mock.calls[0] as [
      string,
      { version: number; kits: Array<{ name: string; description?: string }> },
    ];
    expect(manifest.kits).toStrictEqual([{ name: 'deploy', description: 'Updated' }]);
  });

  it('skips manifest for single-file compile when --skip-manifest is set', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/out.js', changed: true });

    await compileCommand(['input.ts', '--skip-manifest']);

    expect(mockWriteManifest).not.toHaveBeenCalled();
    expect(mockReadManifest).not.toHaveBeenCalled();
  });

  it('maintains alphabetical order when upserting manifest entries', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/alpha.js', changed: true });
    mockValidateCompiledOutput.mockResolvedValue({});
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'charlie' }, { name: 'beta' }],
    });

    await compileCommand(['alpha.ts']);

    const [, manifest] = mockWriteManifest.mock.calls[0] as [
      string,
      { version: number; kits: Array<{ name: string }> },
    ];
    expect(manifest.kits.map((k: { name: string }) => k.name)).toStrictEqual(['alpha', 'beta', 'charlie']);
  });
});
