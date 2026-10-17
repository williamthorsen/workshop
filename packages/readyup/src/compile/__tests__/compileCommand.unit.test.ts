import path from 'node:path';
import process from 'node:process';

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

import { MissingChecklistsError } from '../../kits/MissingChecklistsError.ts';
import { richFormatter } from '../../layout/formatter.ts';
import { ManifestNotFoundError } from '../../manifest/readManifest.ts';
import { compileCommand } from '../compileCommand.ts';
import { compileResult, kitSource, SRC_DIR } from '../test-utils/compile-result-fixtures.ts';
import { compile, compileRaising } from '../test-utils/compile-runners.ts';

const ICON_NO_CHANGES = richFormatter.tokens.skippedOptional.text;
const ICON_COMPILED = richFormatter.tokens.passed.text;
const GLYPH_OUTPUT = richFormatter.tokens.kit.text;

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

  // Explicit input file tests
  it('returns 0 and writes a section heading for single file', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('input.ts', { outputPath: '/abs/out.js', changed: true, targetHash: 'aaaa1111' }),
    );

    const { exitCode, stdout } = await compile(['input.ts']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', undefined);
    expect(stdout).toContain('\u{2500}\u{2500} Compiling kit\n');
  });

  it('shows compiled indicator for a changed single file', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('input.ts', { outputPath: '/abs/out.js', changed: true, targetHash: 'aaaa1111' }),
    );

    const { stdout } = await compile(['input.ts']);

    expect(stdout).toContain(`${ICON_COMPILED} input.ts -> ${GLYPH_OUTPUT} `);
    expect(stdout).not.toContain('\u{2192}');
  });

  it('shows no-changes indicator for an unchanged single file', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('input.ts', { outputPath: '/abs/out.js', changed: false, targetHash: 'aaaa1111' }),
    );

    const { stdout } = await compile(['input.ts']);

    expect(stdout).toContain(ICON_NO_CHANGES);
    expect(stdout).toContain('no changes');
  });

  it('returns 1 when compileConfig throws', async () => {
    mockCompileConfig.mockRejectedValue(new Error('esbuild is required'));

    const { exitCode, stderr } = await compile(['input.ts']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('esbuild is required');
  });

  it('forwards an install hint from a config file whose imports could not be resolved', async () => {
    mockLoadConfig.mockRejectedValue(
      Object.assign(new Error("Cannot resolve 'some-lib' while evaluating config.ts."), {
        hint: 'Install it with: pnpm add --save-dev some-lib',
      }),
    );

    const { error } = await compileRaising([]);

    expect(error.code).toBe('config');
    expect(error.hint).toBe('Install it with: pnpm add --save-dev some-lib');
  });

  it('loads the config named by --config for a batch compile', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
    });
    mockExistsSync.mockReturnValue(false);

    const { exitCode } = await compile(['--config', 'custom/readyup.config.ts']);

    expect(exitCode).toBe(0);
    expect(mockLoadConfig).toHaveBeenCalledWith({ overridePath: 'custom/readyup.config.ts' });
  });

  // Batch compile tests
  it('prints "Compiling kits in" header when srcDir equals outDir', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('a.ts'), { outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' }),
    );

    const { stdout } = await compile([]);

    expect(stdout).toContain('Compiling kits in');
    expect(stdout).not.toContain(' to ');
  });

  // `pnpm -r exec rdy compile` gives each workspace its own working directory, so a heading naming paths
  // against that one reads identically from every workspace and tells the reader nothing.
  it('names the source directory against the enclosing workspace root', async () => {
    const workspaceRoot = path.resolve(process.cwd(), '..', '..');
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
    });
    mockExistsSync.mockImplementation((target: string) => {
      if (target.endsWith('pnpm-workspace.yaml')) return target === path.join(workspaceRoot, 'pnpm-workspace.yaml');
      return !target.endsWith('.git');
    });
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('a.ts'), { outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' }),
    );

    const { stdout } = await compile([]);

    const expected = path.relative(workspaceRoot, path.resolve(process.cwd(), '.readyup/kits'));
    expect(stdout).toContain(`Compiling kits in ${expected}`);
  });

  // Because readyup is published, it runs in repositories that have no workspace file and in directories under
  // no repository at all. Both still need a stable anchor rather than no heading.
  it('falls back to the working directory when no workspace or repository encloses the source', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
    });
    mockExistsSync.mockImplementation(
      (target: string) => !target.endsWith('pnpm-workspace.yaml') && !target.endsWith('.git'),
    );
    mockReaddirSync.mockReturnValue(['a.ts']);

    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('a.ts'), { outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' }),
    );

    const { stdout } = await compile([]);

    expect(stdout).toContain('Compiling kits in .readyup/kits');
  });

  it('prints "from ... to ..." header when srcDir differs from outDir', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/dist', include: undefined, exclude: [] },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockResolvedValue(
      compileResult(kitSource('a.ts'), { outputPath: '/abs/a.js', changed: true, targetHash: 'aaaa1111' }),
    );

    const { stdout } = await compile([]);

    expect(stdout).toContain('from');
    expect(stdout).toContain('to');
  });

  it('compiles all .ts files and shows per-file status lines', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
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

    const { exitCode, stdout, stdoutChunks } = await compile([]);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledTimes(2);
    // Header + 2 status lines
    expect(stdoutChunks).toHaveLength(3);
    expect(stdout).toContain(`${ICON_COMPILED} a.ts -> ${GLYPH_OUTPUT} a.js`);
    expect(stdout).toContain(`${ICON_NO_CHANGES} b.ts \u{00B7} no changes`);
  });

  it('uses compile.include glob to filter files during batch compile', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: ['shared/*.ts'], exclude: [] },
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

    const { exitCode } = await compile([]);

    expect(exitCode).toBe(0);
    expect(mockPicomatch).toHaveBeenCalledWith(['shared/*.ts']);
    expect(mockCompileConfig).toHaveBeenCalledTimes(2);
  });

  // Post-compile validation tests
  it('returns 1 when post-compile validation fails for explicit input', async () => {
    mockCompileConfig.mockRejectedValue(new Error('Suite name(s) collide with checklist name(s): deploy'));

    const { exitCode, stderr } = await compile(['input.ts']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Suite name(s) collide');
    expect(mockWriteManifest).not.toHaveBeenCalled();
  });

  it('returns 1 when post-compile validation fails during batch compile', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['a.ts']);
    mockCompileConfig.mockRejectedValue(new Error('suite "ci" references unknown checklist "missing"'));

    const { exitCode, stderr } = await compile([]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('references unknown checklist');
  });

  describe('source that is not a kit', () => {
    it('names compile.exclude when a sweep finds a source that exports no checklists', async () => {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
      });
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['shared.ts']);
      mockCompileConfig.mockRejectedValue(new MissingChecklistsError());

      const { stderr } = await compile([]);
      const { stdout } = await compile(['--json']);

      expect(stderr).toContain('`compile.exclude`');
      expect(JSON.parse(stdout)).toMatchObject({
        kits: [{ name: 'shared', status: 'failed', error: expect.stringContaining('`compile.exclude`') }],
      });
    });

    it('omits compile.exclude when a named file exports no checklists', async () => {
      mockCompileConfig.mockRejectedValue(new MissingChecklistsError());

      const { stderr } = await compile(['input.ts']);
      const { stdout } = await compile(['input.ts', '--json']);

      expect(stderr).toContain('must export checklists');
      expect(stderr).not.toContain('compile.exclude');
      expect(stdout).not.toContain('compile.exclude');
    });

    it('omits compile.exclude from a sweep failure of another kind', async () => {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
      });
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['a.ts']);
      mockCompileConfig.mockRejectedValue(new Error('a is not valid TypeScript'));

      const { stderr } = await compile([]);

      expect(stderr).toContain('a is not valid TypeScript');
      expect(stderr).not.toContain('compile.exclude');
    });
  });

  describe('sources in subdirectories', () => {
    /** Arranges a batch whose sources include a nested one sharing its basename with a top-level kit. */
    function arrangeNestedBatch(): void {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
      });
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['deploy.ts', 'ops', 'ops/deploy.ts']);
      mockCompileConfig
        .mockResolvedValueOnce(
          compileResult(kitSource('deploy.ts'), {
            outputPath: '/abs/deploy.js',
            changed: true,
            targetHash: 'aaaa1111',
          }),
        )
        .mockResolvedValueOnce(
          compileResult(kitSource('ops/deploy.ts'), {
            outputPath: '/abs/ops/deploy.js',
            changed: true,
            targetHash: 'bbbb2222',
          }),
        );
    }

    it('names a nested kit by its path below the source directory', async () => {
      arrangeNestedBatch();

      await compile([]);

      expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
        version: 1,
        kits: [expect.objectContaining({ name: 'deploy' }), expect.objectContaining({ name: 'ops/deploy' })],
      });
    });

    it('compiles a nested source sharing its basename with a top-level kit', async () => {
      arrangeNestedBatch();

      const { exitCode, stdout } = await compile(['--json']);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toStrictEqual({
        schemaVersion: 1,
        passed: true,
        kits: [
          { name: 'deploy', status: 'compiled' },
          { name: 'ops/deploy', status: 'compiled' },
        ],
      });
    });

    it('compiles a nested source into the matching subdirectory of the output directory', async () => {
      arrangeNestedBatch();

      await compile([]);

      expect(mockCompileConfig).toHaveBeenCalledWith(kitSource('ops/deploy.ts'), kitSource('ops/deploy.js'));
    });
  });

  it('reports a config error when readdirSync throws during batch compile', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
    });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const { error } = await compileRaising([]);

    expect(error.code).toBe('config');
    expect(error.message).toContain('Failed to read source directory');
    expect(error.message).toContain('EACCES');
  });

  it('names a nested single-file compile by its bundle below the output directory', async () => {
    const source = path.join(SRC_DIR, 'team-a', 'deploy.ts');
    mockCompileConfig.mockResolvedValue(
      compileResult(source, {
        outputPath: kitSource('team-a/deploy.js'),
        changed: true,
        targetHash: 'deadbeef',
      }),
    );
    mockReadManifest.mockReturnValue({ version: 1, kits: [{ name: 'deploy', description: 'The top-level kit' }] });

    await compile([source]);

    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
      version: 1,
      kits: [
        { name: 'deploy', description: 'The top-level kit' },
        expect.objectContaining({ name: 'team-a/deploy', path: 'kits/team-a/deploy.js' }),
      ],
    });
  });

  it('names a single-file compile from the output directory of the config that --config names', async () => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: 'custom/kits', outDir: 'custom/kits', include: undefined, exclude: [] },
    });
    const source = path.join('custom', 'kits', 'ops', 'deploy.ts');
    mockCompileConfig.mockResolvedValue(
      compileResult(source, {
        outputPath: path.resolve('custom/kits/ops/deploy.js'),
        changed: true,
        targetHash: 'deadbeef',
      }),
    );
    mockReadManifest.mockReturnValue({ version: 1, kits: [] });

    await compile([source, '--config', 'custom/readyup.config.ts']);

    expect(mockLoadConfig).toHaveBeenCalledWith({ overridePath: 'custom/readyup.config.ts' });
    expect(mockWriteManifest).toHaveBeenCalledWith(expect.any(String), {
      version: 1,
      kits: [expect.objectContaining({ name: 'ops/deploy' })],
    });
  });

  // esbuild reports the path to which it resolved a module, so a symlink above the kit leaves the closure
  // keyed on a path that the command was never handed.
  it('finds the entry point record under the real path of the source that it was given', async () => {
    const realEntryPath = path.resolve('/real/kits/deploy.ts');
    mockRealpathSync.mockReturnValue(realEntryPath);
    mockCompileConfig.mockResolvedValue(
      compileResult(realEntryPath, { outputPath: '/abs/deploy.js', changed: true, targetHash: 'deadbeef' }, 'r34lp47h'),
    );
    mockReadManifest.mockImplementation(() => {
      throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
    });

    await compile(['deploy.ts']);

    expect(mockWriteManifest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ kits: [expect.objectContaining({ sourceHash: 'r34lp47h' })] }),
    );
  });
});
