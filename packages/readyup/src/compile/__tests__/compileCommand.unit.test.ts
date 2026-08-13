import assert from 'node:assert';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import type { RdyManifest } from '../../manifest/manifestSchema.ts';

const mockCompileConfig = vi.hoisted(() => vi.fn());
const mockValidateCompiledOutput = vi.hoisted(() => vi.fn());
const mockLoadConfig = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockReaddirSync = vi.hoisted(() => vi.fn());
const mockRealpathSync = vi.hoisted(() => Object.assign(vi.fn(), { native: vi.fn() }));
const mockPicomatch = vi.hoisted(() => vi.fn());
const mockWriteManifest = vi.hoisted(() => vi.fn());
const mockReadManifest = vi.hoisted(() => vi.fn());
const mockCheckDrift = vi.hoisted(() => vi.fn());

vi.mock(import('../compileConfig.ts'), () => ({
  compileConfig: mockCompileConfig,
}));

vi.mock(import('../validateCompiledOutput.ts'), () => ({
  validateCompiledOutput: mockValidateCompiledOutput,
}));

vi.mock(import('../../config/loadConfig.ts'), () => ({
  loadConfig: mockLoadConfig,
}));

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

import { richFormatter } from '../../layout/richFormatter.ts';
import { ManifestNotFoundError } from '../../manifest/readManifest.ts';
import { captureRdyError } from '../../test-utils/captureRdyError.ts';
import { VERSION } from '../../version.ts';
import { compileCommand } from '../compileCommand.ts';
import type { CompileResult } from '../compileConfig.ts';
import type { KitMetadata } from '../validateCompiledOutput.ts';

const ICON_NO_CHANGES = richFormatter.tokens.skippedOptional.glyph;
const ICON_COMPILED = richFormatter.tokens.passed.glyph;
const ICON_DRIFT = richFormatter.tokens.failedWarn.glyph;
const GLYPH_OUTPUT = richFormatter.tokens.kit.glyph;

/** Directory the batch tests sweep, matching the `srcDir` the config they mock declares. */
const SRC_DIR = '.readyup/kits';

/** The hash a compile records for its entry point, which is where a manifest entry's `sourceHash` comes from. */
const SOURCE_HASH = '5c0urce1';

/** Returns the absolute path of a kit source in the directory a batch compile sweeps. */
function kitSource(fileName: string): string {
  return path.resolve(process.cwd(), SRC_DIR, fileName);
}

/**
 * Builds a `compileConfig` result whose closure records `entry` as the module the bundle was built from.
 *
 * A test that cares which file supplied `sourceHash` says so by naming the entry, because the command
 * reads the hash back out of the closure rather than hashing the source itself.
 */
function compileResult(
  entry: string,
  result: { outputPath: string; changed: boolean; targetHash: string },
  hash: string = SOURCE_HASH,
): CompileResult {
  return { ...result, inputs: [{ hash, kind: 'module', path: path.resolve(entry) }] };
}

/** Returns the `inputs` an entry carries when its compile read only the entry point, stated against the manifest. */
function recordedEntry(relativePath: string, hash: string = SOURCE_HASH) {
  return [{ hash, kind: 'module', path: relativePath }];
}

/** Metadata as `validateCompiledOutput` returns it, defaulting to a kit with no checklists to record. */
function kitMetadata(overrides: Partial<KitMetadata> = {}): KitMetadata {
  return { checklists: [], ...overrides };
}

describe(compileCommand, () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockValidateCompiledOutput.mockResolvedValue(kitMetadata());
    mockCheckDrift.mockReturnValue({ kind: 'unverified' });
    // No path these tests name holds a symlink, so a real path is the path itself.
    mockRealpathSync.mockImplementation((target: string) => target);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockCompileConfig.mockReset();
    mockValidateCompiledOutput.mockReset();
    mockLoadConfig.mockReset();
    mockExistsSync.mockReset();
    mockReaddirSync.mockReset();
    mockRealpathSync.mockReset();
    mockPicomatch.mockReset();
    mockWriteManifest.mockReset();
    mockReadManifest.mockReset();
    mockCheckDrift.mockReset();
  });

  // Explicit input file tests
  it('returns 0 and writes a section heading for single file', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('input.ts', { outputPath: '/abs/out.js', changed: true, targetHash: 'aaaa1111' }),
    );

    const exitCode = await compileCommand(['input.ts']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', undefined);
    expect(stdoutSpy).toHaveBeenCalledWith('\u{2500}\u{2500} Compiling kit\n');
  });

  it('shows compiled indicator for a changed single file', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('input.ts', { outputPath: '/abs/out.js', changed: true, targetHash: 'aaaa1111' }),
    );

    await compileCommand(['input.ts']);

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`${ICON_COMPILED} input.ts -> ${GLYPH_OUTPUT} `));
    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('\u{2192}'));
  });

  it('shows no-changes indicator for an unchanged single file', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('input.ts', { outputPath: '/abs/out.js', changed: false, targetHash: 'aaaa1111' }),
    );

    await compileCommand(['input.ts']);

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(ICON_NO_CHANGES));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('no changes'));
  });

  it('passes --output value to compileConfig', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('input.ts', { outputPath: '/abs/custom.js', changed: true, targetHash: 'aaaa1111' }),
    );

    const exitCode = await compileCommand(['input.ts', '--output', 'custom.js']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', 'custom.js');
  });

  it('passes --output=value inline form to compileConfig', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('input.ts', { outputPath: '/abs/custom.js', changed: true, targetHash: 'aaaa1111' }),
    );

    const exitCode = await compileCommand(['input.ts', '--output=custom.js']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', 'custom.js');
  });

  it('passes -o value short form to compileConfig', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('input.ts', { outputPath: '/abs/custom.js', changed: true, targetHash: 'aaaa1111' }),
    );

    const exitCode = await compileCommand(['input.ts', '-o', 'custom.js']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', 'custom.js');
  });

  it('reports a usage error when --output is provided without a value', async () => {
    const error = await captureRdyError(() => compileCommand(['input.ts', '--output']));

    expect(error.code).toBe('usage');
    expect(error.message).toContain('--output requires a path argument');
  });

  it('reports a usage error when --output is given an empty value', async () => {
    const error = await captureRdyError(() => compileCommand(['input.ts', '--output=']));

    expect(error.code).toBe('usage');
    expect(error.message).toContain('--output requires a path argument');
  });

  it('reports a usage error for unknown flags', async () => {
    const error = await captureRdyError(() => compileCommand(['input.ts', '--verbose']));

    expect(error.code).toBe('usage');
    expect(error.message).toContain("Unknown option '--verbose'");
  });

  it('returns 1 when compileConfig throws', async () => {
    mockCompileConfig.mockRejectedValue(new Error('esbuild is required'));

    const exitCode = await compileCommand(['input.ts']);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('esbuild is required'));
  });

  it('reports a usage error when multiple positional arguments are provided', async () => {
    const error = await captureRdyError(() => compileCommand(['a.ts', 'b.ts']));

    expect(error.code).toBe('usage');
    expect(error.message).toContain('Too many arguments');
  });

  it('forwards an install hint from a config file whose imports could not be resolved', async () => {
    mockLoadConfig.mockRejectedValue(
      Object.assign(new Error("Cannot resolve 'some-lib' while evaluating config.ts."), {
        hint: 'Install it with: pnpm add --save-dev some-lib',
      }),
    );

    const error = await captureRdyError(() => compileCommand([]));

    expect(error.code).toBe('config');
    expect(error.hint).toBe('Install it with: pnpm add --save-dev some-lib');
  });

  // Batch compile tests
  it('prints "Compiling kits in" header when srcDir equals outDir', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('a.ts'), { outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' }),
    );

    await compileCommand([]);

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Compiling kits in'));
    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining(' to '));
  });

  // `pnpm -r exec rdy compile` gives each workspace its own working directory, so a heading naming paths
  // against that one reads identically from every workspace and tells the reader nothing.
  it('names the source directory against the enclosing workspace root', async () => {
    const workspaceRoot = path.resolve(process.cwd(), '..', '..');
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockImplementation((target: string) => {
      if (target.endsWith('pnpm-workspace.yaml')) return target === path.join(workspaceRoot, 'pnpm-workspace.yaml');
      return !target.endsWith('.git');
    });
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('a.ts'), { outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' }),
    );

    await compileCommand([]);

    const expected = path.relative(workspaceRoot, path.resolve(process.cwd(), '.readyup/kits'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`Compiling kits in ${expected}`));
  });

  // Readyup is published, so it runs in repositories that have no workspace file and in directories under
  // no repository at all. Both still need a stable anchor rather than no heading.
  it('falls back to the working directory when no workspace or repository encloses the source', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockImplementation(
      (target: string) => !target.endsWith('pnpm-workspace.yaml') && !target.endsWith('.git'),
    );
    mockReaddirSync.mockReturnValue(['a.ts']);

    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('a.ts'), { outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' }),
    );

    await compileCommand([]);

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Compiling kits in .readyup/kits'));
  });

  it('prints "from ... to ..." header when srcDir differs from outDir', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/dist', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('a.ts'), { outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' }),
    );

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
      .mockResolvedValueOnce(
        compileResult(kitSource('a.ts'), { outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' }),
      )
      .mockResolvedValueOnce(
        compileResult(kitSource('b.ts'), { outputPath: '/abs/b.js', changed: false, targetHash: 'bbbb2222' }),
      );

    const exitCode = await compileCommand([]);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledTimes(2);
    // Header + 2 status lines
    expect(stdoutSpy).toHaveBeenCalledTimes(3);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`${ICON_COMPILED} a.ts -> ${GLYPH_OUTPUT} a.js`));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`${ICON_NO_CHANGES} b.ts \u{00B7} no changes`));
  });

  it('reports a usage error when --output is given without an input file', async () => {
    const error = await captureRdyError(() => compileCommand(['--output', 'out.js']));

    expect(error.code).toBe('usage');
    expect(error.message).toContain('--output requires an input file');
  });

  it('reports a usage error for --all (removed flag)', async () => {
    const error = await captureRdyError(() => compileCommand(['--all']));

    expect(error.code).toBe('usage');
    expect(error.message).toContain("Unknown option '--all'");
  });

  it('uses compile.include glob to filter files during batch compile', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: 'shared/*.ts' },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['shared/deploy.ts', 'shared/infra.ts', 'other.ts']);
    const matchFn = vi.fn((name: string) => name.startsWith('shared/'));
    mockPicomatch.mockReturnValue(matchFn);
    mockCompileConfig
      .mockResolvedValueOnce(
        compileResult(kitSource('shared/deploy.ts'), {
          outputPath: '/abs/deploy.js',
          changed: true,
          targetHash: 'aaaa1111',
        }),
      )
      .mockResolvedValueOnce(
        compileResult(kitSource('shared/infra.ts'), {
          outputPath: '/abs/infra.js',
          changed: true,
          targetHash: 'bbbb2222',
        }),
      );

    const exitCode = await compileCommand([]);

    expect(exitCode).toBe(0);
    expect(mockPicomatch).toHaveBeenCalledWith('shared/*.ts');
    expect(mockCompileConfig).toHaveBeenCalledTimes(2);
  });

  describe('sweep that finds no kits', () => {
    it('writes no manifest when the source directory is absent and no manifest exists', async () => {
      arrangeEmptySweep({ srcDirExists: false, manifestExists: false });

      const exitCode = await compileCommand([]);

      expect(exitCode).toBe(0);
      expect(mockReaddirSync).not.toHaveBeenCalled();
      expect(mockWriteManifest).not.toHaveBeenCalled();
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('Source directory not found: .readyup/kits; manifest not written'),
      );
    });

    it('writes no manifest when the source directory holds no .ts files and no manifest exists', async () => {
      arrangeEmptySweep({ srcDirExists: true, manifestExists: false });
      mockReaddirSync.mockReturnValue(['readme.md']);

      const exitCode = await compileCommand([]);

      expect(exitCode).toBe(0);
      expect(mockWriteManifest).not.toHaveBeenCalled();
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('No .ts files found in .readyup/kits; manifest not written'),
      );
    });

    it('empties an existing manifest when the source directory is absent', async () => {
      arrangeEmptySweep({ srcDirExists: false, manifestExists: true });

      const exitCode = await compileCommand([]);

      expect(exitCode).toBe(0);
      expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), { version: 1, kits: [] });
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('manifest now lists no kits'));
    });

    it('empties an existing manifest when the source directory holds no .ts files', async () => {
      arrangeEmptySweep({ srcDirExists: true, manifestExists: true });
      mockReaddirSync.mockReturnValue(['readme.md']);

      const exitCode = await compileCommand([]);

      expect(exitCode).toBe(0);
      expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), { version: 1, kits: [] });
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('manifest now lists no kits'));
    });

    it('gates on the path --manifest names rather than the default', async () => {
      arrangeEmptySweep({ srcDirExists: false, manifestExists: false });

      await compileCommand(['--manifest', 'custom/manifest.json']);

      expect(mockExistsSync).toHaveBeenCalledWith(path.resolve(process.cwd(), 'custom/manifest.json'));
      expect(mockWriteManifest).not.toHaveBeenCalled();
    });

    it('omits the manifest clause under --skip-manifest when the source directory is absent', async () => {
      arrangeEmptySweep({ srcDirExists: false, manifestExists: true });

      const exitCode = await compileCommand(['--skip-manifest']);

      expect(exitCode).toBe(0);
      expect(mockWriteManifest).not.toHaveBeenCalled();
      expect(stdoutSpy).toHaveBeenCalledWith('Source directory not found: .readyup/kits\n');
    });

    it('omits the manifest clause under --skip-manifest when the directory holds no .ts files', async () => {
      arrangeEmptySweep({ srcDirExists: true, manifestExists: true });
      mockReaddirSync.mockReturnValue(['readme.md']);

      const exitCode = await compileCommand(['--skip-manifest']);

      expect(exitCode).toBe(0);
      expect(mockWriteManifest).not.toHaveBeenCalled();
      expect(stdoutSpy).toHaveBeenCalledWith('No .ts files found in .readyup/kits\n');
    });

    // region | Helpers

    /** Arranges a config-driven sweep that finds no kits. */
    function arrangeEmptySweep(existence: ArrangeExistenceArgs): void {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
      });
      arrangeExistence(existence);
    }

    // endregion | Helpers
  });

  // Post-compile validation tests
  it('returns 1 when post-compile validation fails for explicit input', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('input.ts', { outputPath: '/abs/out.js', changed: true, targetHash: 'aaaa1111' }),
    );
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
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('a.ts'), { outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' }),
    );
    mockValidateCompiledOutput.mockRejectedValue(new Error('suite "ci" references unknown checklist "missing"'));

    const exitCode = await compileCommand([]);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('references unknown checklist'));
  });

  describe('sweep completion', () => {
    /** A two-kit batch whose first kit fails to compile and whose second succeeds. */
    function arrangeMixedBatch(): void {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
      });
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['alpha.ts', 'beta.ts']);
      mockCompileConfig
        .mockRejectedValueOnce(new Error('alpha is not valid TypeScript'))
        .mockResolvedValueOnce(
          compileResult(kitSource('beta.ts'), { outputPath: '/abs/beta.js', changed: true, targetHash: 'bbbb2222' }),
        );
    }

    it('compiles the kits after a failed one instead of abandoning the sweep', async () => {
      arrangeMixedBatch();

      const exitCode = await compileCommand([]);

      expect(exitCode).toBe(1);
      expect(mockCompileConfig).toHaveBeenCalledTimes(2);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Error compiling alpha.ts'));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('beta.ts'));
    });

    it('reports how many kits failed once the sweep finishes', async () => {
      arrangeMixedBatch();

      await compileCommand([]);

      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('1 of 2 kits failed to compile.'));
    });

    it('writes a manifest when sources are found but every one fails to compile', async () => {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
      });
      arrangeExistence({ srcDirExists: true, manifestExists: false });
      mockReaddirSync.mockReturnValue(['alpha.ts', 'beta.ts']);
      mockCompileConfig.mockRejectedValue(new Error('not valid TypeScript'));

      const exitCode = await compileCommand([]);

      expect(exitCode).toBe(1);
      expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), { version: 1, kits: [] });
    });

    it('leaves a failed kit out of the manifest rather than recording it as compiled', async () => {
      arrangeMixedBatch();

      await compileCommand([]);

      expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
        version: 1,
        kits: [expect.objectContaining({ name: 'beta' })],
      });
    });

    it('keeps the manifest entry a failed kit already had', async () => {
      arrangeMixedBatch();
      const recordedAlpha = {
        name: 'alpha',
        path: 'alpha.js',
        readyupVersion: VERSION,
        source: 'alpha.ts',
        targetHash: 'aaaa1111',
      };
      mockReadManifest.mockReturnValue({ version: 1, kits: [recordedAlpha] });

      await compileCommand([]);

      expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
        version: 1,
        kits: [recordedAlpha, expect.objectContaining({ name: 'beta' })],
      });
    });

    it('reports the failure even though the kit keeps its entry', async () => {
      arrangeMixedBatch();
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [
          { name: 'alpha', path: 'alpha.js', readyupVersion: VERSION, source: 'alpha.ts', targetHash: 'aaaa1111' },
        ],
      });

      const exitCode = await compileCommand([]);

      expect(exitCode).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Error compiling alpha.ts'));
    });
  });

  describe('manifest checklist names', () => {
    it('records the checklist names the compiled kit declares', async () => {
      mockCompileConfig.mockResolvedValue(
        compileResult('deploy.ts', { outputPath: '/abs/deploy.js', changed: true, targetHash: 'aaaa1111' }),
      );
      mockValidateCompiledOutput.mockResolvedValue(kitMetadata({ checklists: ['preflight', 'deploy'] }));
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('missing');
      });

      await compileCommand(['deploy.ts']);

      expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
        version: 1,
        kits: [expect.objectContaining({ name: 'deploy', checklists: ['preflight', 'deploy'] })],
      });
    });

    it('omits the field for a kit with no checklists to record', async () => {
      mockCompileConfig.mockResolvedValue(
        compileResult('deploy.ts', { outputPath: '/abs/deploy.js', changed: true, targetHash: 'aaaa1111' }),
      );
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('missing');
      });

      await compileCommand(['deploy.ts']);

      const [call] = mockWriteManifest.mock.calls;
      assert.ok(call);
      const manifest: RdyManifest = call[1];

      expect(manifest.kits[0]).not.toHaveProperty('checklists');
    });
  });

  describe('--json', () => {
    it('reports every kit status on stdout and keeps prose on stderr', async () => {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
      });
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['alpha.ts', 'beta.ts']);
      mockCompileConfig
        .mockRejectedValueOnce(new Error('alpha is not valid TypeScript'))
        .mockResolvedValueOnce(
          compileResult(kitSource('beta.ts'), { outputPath: '/abs/beta.js', changed: true, targetHash: 'bbbb2222' }),
        );

      const exitCode = await compileCommand(['--json']);

      expect(exitCode).toBe(1);
      expect(stdoutSpy).toHaveBeenCalledTimes(1);
      const [jsonCall] = stdoutSpy.mock.calls;
      assert.ok(jsonCall);
      expect(JSON.parse(String(jsonCall[0]))).toStrictEqual({
        schemaVersion: 1,
        passed: false,
        kits: [
          { name: 'alpha', status: 'failed', error: 'alpha is not valid TypeScript' },
          { name: 'beta', status: 'compiled' },
        ],
      });
    });

    it('reports a clean single-file compile as passed', async () => {
      mockCompileConfig.mockResolvedValue(
        compileResult('deploy.ts', { outputPath: '/abs/deploy.js', changed: true, targetHash: 'aaaa1111' }),
      );
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('missing');
      });

      const exitCode = await compileCommand(['deploy.ts', '--json']);

      expect(exitCode).toBe(0);
      const [jsonCall] = stdoutSpy.mock.calls;
      assert.ok(jsonCall);
      expect(JSON.parse(String(jsonCall[0]))).toMatchObject({
        passed: true,
        kits: [{ name: 'deploy', status: 'compiled' }],
      });
    });

    it('reports a drift-skipped kit with the reason it was left alone', async () => {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy', path: 'deploy.js', targetHash: 'aaaa1111' }],
      });
      mockCheckDrift.mockReturnValue({
        kind: 'drift',
        expected: 'aaaa1111',
        actual: 'ffff9999',
        resolvedPath: '/abs/deploy.js',
      });

      const exitCode = await compileCommand(['deploy.ts', '--json']);

      expect(exitCode).toBe(1);
      const [jsonCall] = stdoutSpy.mock.calls;
      assert.ok(jsonCall);
      expect(JSON.parse(String(jsonCall[0]))).toMatchObject({
        passed: false,
        kits: [{ name: 'deploy', status: 'skipped', error: expect.stringContaining('drifted') }],
      });
    });
  });

  it('reports a config error when readdirSync throws during batch compile', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const error = await captureRdyError(() => compileCommand([]));

    expect(error.code).toBe('config');
    expect(error.message).toContain('Failed to read source directory');
    expect(error.message).toContain('EACCES');
  });

  it('treats an include glob matching only non-.ts files as a sweep that finds no kits', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: 'data/*' },
    });
    arrangeExistence({ srcDirExists: true, manifestExists: true });
    mockReaddirSync.mockReturnValue(['data/readme.md', 'data/config.json']);
    mockPicomatch.mockReturnValue(() => true);

    const exitCode = await compileCommand([]);

    expect(exitCode).toBe(0);
    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), { version: 1, kits: [] });
  });

  /** A two-kit batch in which both kits compile successfully. */
  function arrangeTwoKitBatch(hashes: { alphaHash?: string; betaHash?: string } = {}): void {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: SRC_DIR, outDir: SRC_DIR, include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['alpha.ts', 'beta.ts']);
    // Keyed by the source rather than queued, so a kit the sweep skips does not hand its result to the next one.
    mockCompileConfig.mockImplementation((inputPath: string) => {
      const isAlpha = path.basename(inputPath) === 'alpha.ts';
      const result = isAlpha
        ? { outputPath: '/abs/alpha.js', changed: true, targetHash: 'aaaa1111' }
        : { outputPath: '/abs/beta.js', changed: true, targetHash: 'bbbb2222' };

      return Promise.resolve(compileResult(inputPath, result, isAlpha ? hashes.alphaHash : hashes.betaHash));
    });
  }

  // Manifest generation tests
  it('writes manifest after batch compile with kit entries including location fields', async () => {
    arrangeTwoKitBatch();
    mockValidateCompiledOutput
      .mockResolvedValueOnce(kitMetadata({ description: 'Alpha checks' }))
      .mockResolvedValueOnce(kitMetadata());

    await compileCommand([]);

    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
      version: 1,
      kits: [
        {
          inputs: recordedEntry('kits/alpha.ts'),
          name: 'alpha',
          description: 'Alpha checks',
          path: expect.stringContaining('alpha.js'),
          readyupVersion: VERSION,
          source: expect.stringContaining('alpha.ts'),
          sourceHash: '5c0urce1',
          targetHash: 'aaaa1111',
        },
        {
          inputs: recordedEntry('kits/beta.ts'),
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
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('a.ts'), { outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' }),
    );

    await compileCommand(['--skip-manifest']);

    expect(mockWriteManifest).not.toHaveBeenCalled();
  });

  it('uses custom manifest path from --manifest flag', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('a.ts'), { outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' }),
    );

    await compileCommand(['--manifest=custom/manifest.json']);

    expect(mockWriteManifest).toHaveBeenCalledWith(expect.stringContaining('custom/manifest.json'), expect.anything());
  });

  it('upserts manifest entry for single-file compile with location fields', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('deploy.ts', { outputPath: '/abs/deploy.js', changed: true, targetHash: 'deadbeef' }),
    );
    mockValidateCompiledOutput.mockResolvedValue(kitMetadata({ description: 'Deploy checks' }));
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
          inputs: recordedEntry('../deploy.ts'),
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
    mockValidateCompiledOutput.mockResolvedValue(kitMetadata());
    mockReadManifest.mockImplementation(() => {
      throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
    });

    await compileCommand(['deploy.ts']);

    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
      version: 1,
      kits: [
        {
          inputs: recordedEntry('../deploy.ts'),
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
      compileResult('deploy.ts', { outputPath: '/abs/deploy.js', changed: true, targetHash: 'deadbeef' }),
    );
    mockValidateCompiledOutput.mockResolvedValue(kitMetadata({ description: 'Updated' }));
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'deploy', description: 'Old' }],
    });

    await compileCommand(['deploy.ts']);

    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
      version: 1,
      kits: [
        {
          inputs: recordedEntry('../deploy.ts'),
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

  // esbuild reports the path it resolved a module to, so a symlink above the kit leaves the closure keyed
  // on a path the command was never handed.
  it('finds the entry point record under the real path of the source it was given', async () => {
    const realEntryPath = path.resolve('/real/kits/deploy.ts');
    mockRealpathSync.mockReturnValue(realEntryPath);
    mockCompileConfig.mockResolvedValue(
      compileResult(realEntryPath, { outputPath: '/abs/deploy.js', changed: true, targetHash: 'deadbeef' }, 'r34lp47h'),
    );
    mockReadManifest.mockImplementation(() => {
      throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
    });

    await compileCommand(['deploy.ts']);

    expect(mockWriteManifest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ kits: [expect.objectContaining({ sourceHash: 'r34lp47h' })] }),
    );
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

    await compileCommand(['deploy.ts']);

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

    await compileCommand(['deploy.ts']);

    expect(mockWriteManifest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ kits: [expect.objectContaining({ sourceHash: 'e47r1e50' })] }),
    );
  });

  it('records a distinct source hash per kit in a batch compile', async () => {
    arrangeTwoKitBatch({ alphaHash: 'a1a1a1a1', betaHash: 'b2b2b2b2' });

    await compileCommand([]);

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

    await compileCommand([]);

    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
      version: 1,
      kits: [recordedAlpha, expect.objectContaining({ name: 'beta' })],
    });
  });

  it('skips manifest for single-file compile when --skip-manifest is set', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('input.ts', { outputPath: '/abs/out.js', changed: true, targetHash: 'aaaa1111' }),
    );

    await compileCommand(['input.ts', '--skip-manifest']);

    expect(mockWriteManifest).not.toHaveBeenCalled();
    expect(mockReadManifest).not.toHaveBeenCalled();
  });

  it('reports a config error when writeManifest throws during batch compile', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('a.ts'), { outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' }),
    );
    mockWriteManifest.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const error = await captureRdyError(() => compileCommand([]));

    expect(error.code).toBe('config');
    expect(error.message).toContain('Error writing manifest');
    expect(error.message).toContain('EACCES');
  });

  it('writes warning to stderr when upsert encounters non-missing-file error', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('deploy.ts', { outputPath: '/abs/deploy.js', changed: true, targetHash: 'deadbeef' }),
    );
    mockValidateCompiledOutput.mockResolvedValue(kitMetadata());
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
    mockCompileConfig.mockResolvedValue(
      compileResult('deploy.ts', { outputPath: '/abs/deploy.js', changed: true, targetHash: 'deadbeef' }),
    );
    mockValidateCompiledOutput.mockResolvedValue(kitMetadata());
    mockReadManifest.mockImplementation(() => {
      throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
    });

    await compileCommand(['deploy.ts', '--manifest=custom/manifest.json']);

    expect(mockWriteManifest).toHaveBeenCalledTimes(1);
    expect(mockWriteManifest).toHaveBeenCalledWith(expect.stringContaining('custom/manifest.json'), expect.anything());
  });

  it('populates readyupVersion from the runner version on every batch-compile entry', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
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

    await compileCommand([]);

    const [writeManifestCall] = mockWriteManifest.mock.calls;
    assert.ok(writeManifestCall);
    const writtenManifest: RdyManifest = writeManifestCall[1];
    for (const kit of writtenManifest.kits) {
      expect(kit.readyupVersion).toBe(VERSION);
    }
  });

  it('populates readyupVersion when upserting a single-file compile entry', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('deploy.ts', { outputPath: '/abs/deploy.js', changed: true, targetHash: 'deadbeef' }),
    );
    mockValidateCompiledOutput.mockResolvedValue(kitMetadata());
    mockReadManifest.mockImplementation(() => {
      throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
    });

    await compileCommand(['deploy.ts']);

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
    mockValidateCompiledOutput.mockResolvedValue(kitMetadata());
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
    expect(stdoutSpy).toHaveBeenCalledWith(
      `${ICON_DRIFT} deploy.ts\n   drift in deploy.js: expected aaaa1111, got bbbb2222\n`,
    );
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Re-run with --force'));
  });

  it('bypasses drift gate with --force on single-file compile', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('deploy.ts', { outputPath: '/abs/deploy.js', changed: true, targetHash: 'bbbb2222' }),
    );
    mockValidateCompiledOutput.mockResolvedValue(kitMetadata());
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
    expect(mockCompileConfig).toHaveBeenCalledTimes(1);
    expect(mockWriteManifest).toHaveBeenCalledTimes(1);
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
    mockCompileConfig.mockResolvedValueOnce(
      compileResult(kitSource('beta.ts'), { outputPath: '/abs/beta.js', changed: true, targetHash: 'bbbb2222' }),
    );

    const exitCode = await compileCommand([]);

    expect(exitCode).toBe(1);
    expect(mockCompileConfig).toHaveBeenCalledTimes(1); // only beta compiled
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining(`${ICON_DRIFT} alpha.ts\n   drift in alpha.js:`));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('1 of 2 kits skipped due to drift'));

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
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('alpha.ts'), { outputPath: '/abs/alpha.js', changed: true, targetHash: 'aaaa9999' }),
    );

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
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('a.ts'), { outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' }),
    );

    await compileCommand([]);

    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('skipped due to drift'));
  });

  it('warns on stderr when the existing manifest is unreadable during batch compile', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['alpha.ts']);
    mockReadManifest.mockImplementation(() => {
      throw new Error('Unexpected token in JSON at position 0');
    });
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('alpha.ts'), { outputPath: '/abs/alpha.js', changed: true, targetHash: 'aaaa1111' }),
    );

    await compileCommand([]);

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unexpected token in JSON'));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('drift gate skipped'));
  });

  it('is silent when the manifest is missing during batch compile', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['alpha.ts']);
    mockReadManifest.mockImplementation(() => {
      throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
    });
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('alpha.ts'), { outputPath: '/abs/alpha.js', changed: true, targetHash: 'aaaa1111' }),
    );

    await compileCommand([]);

    expect(stderrSpy).not.toHaveBeenCalledWith(expect.stringContaining('drift gate skipped'));
  });

  // region | Helpers

  interface ArrangeExistenceArgs {
    srcDirExists: boolean;
    manifestExists: boolean;
  }

  /** Answers `existsSync` per path, so the source directory and the manifest are arranged independently. */
  function arrangeExistence(existence: ArrangeExistenceArgs): void {
    const { srcDirExists, manifestExists } = existence;
    mockExistsSync.mockImplementation((target: unknown) =>
      String(target).endsWith('manifest.json') ? manifestExists : srcDirExists,
    );
  }

  // endregion | Helpers
});
