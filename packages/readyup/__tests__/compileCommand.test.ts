import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

const mockCompileConfig = vi.hoisted(() => vi.fn());
const mockValidateCompiledOutput = vi.hoisted(() => vi.fn());
const mockLoadConfig = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockReaddirSync = vi.hoisted(() => vi.fn());
const mockPicomatch = vi.hoisted(() => vi.fn());

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

import { compileCommand } from '../src/compile/compileCommand.ts';
import { ICON_SKIPPED_NA as ICON_NO_CHANGES } from '../src/reportRdy.ts';

describe(compileCommand, () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockValidateCompiledOutput.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockCompileConfig.mockReset();
    mockValidateCompiledOutput.mockReset();
    mockLoadConfig.mockReset();
    mockExistsSync.mockReset();
    mockReaddirSync.mockReset();
    mockPicomatch.mockReset();
  });

  // Explicit input file tests
  it('returns 0 and writes "Compiling kit:" header for single file', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/out.js', changed: true });

    const exitCode = await compileCommand(['input.ts']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', undefined);
    expect(stdoutSpy).toHaveBeenCalledWith('Compiling kit:\n');
  });

  it('shows 📦 indicator for a changed single file', async () => {
    mockCompileConfig.mockResolvedValue({ outputPath: '/abs/out.js', changed: true });

    await compileCommand(['input.ts']);

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('📦'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('→'));
  });

  it('shows 🔍 indicator for an unchanged single file', async () => {
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
      compile: { srcDir: '.rdy/kits', outDir: '.rdy/kits', include: undefined },
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
      compile: { srcDir: '.rdy/kits', outDir: '.rdy/dist', include: undefined },
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
      compile: { srcDir: '.rdy/kits', outDir: '.rdy/kits', include: undefined },
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
      compile: { srcDir: '.rdy/kits', outDir: '.rdy/kits', include: 'shared/*.ts' },
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
      compile: { srcDir: '.rdy/kits', outDir: '.rdy/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(false);

    const exitCode = await compileCommand([]);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Source directory not found'));
  });

  it('returns 1 when srcDir has no .ts files', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.rdy/kits', outDir: '.rdy/kits', include: undefined },
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
      compile: { srcDir: '.rdy/kits', outDir: '.rdy/kits', include: undefined },
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
      compile: { srcDir: '.rdy/kits', outDir: '.rdy/kits', include: undefined },
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
      compile: { srcDir: '.rdy/kits', outDir: '.rdy/kits', include: 'data/*' },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['data/readme.md', 'data/config.json']);
    mockPicomatch.mockReturnValue(() => true);

    const exitCode = await compileCommand([]);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('No .ts files found'));
  });
});
