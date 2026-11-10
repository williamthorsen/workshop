import { existsSync } from 'node:fs';
import path from 'node:path';

import { createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCompileConfig = vi.hoisted(() => vi.fn<(inputPath: string, outputPath?: string) => Promise<CompileResult>>());

// The bundler and the import of its output are mocked; configs, manifests, the drift gate, and discovery use the tree.
vi.mock(import('../compileConfig.ts'), () => ({
  compileConfig: mockCompileConfig,
}));

import { MissingChecklistsError } from '../../kits/MissingChecklistsError.ts';
import { richFormatter } from '../../layout/formatter.ts';
import { compileCommand } from '../compileCommand.ts';
import type { CompileResult } from '../compileConfig.ts';
import { buildCompileResult, COMPILED } from '../test-utils/compile-result-fixtures.ts';
import { compile, compileRaising } from '../test-utils/compile-runners.ts';
import { readTreeManifest } from '../test-utils/readTreeManifest.ts';

const ICON_NO_CHANGES = richFormatter.tokens.skippedOptional.text;
const ICON_COMPILED = richFormatter.tokens.passed.text;
const GLYPH_OUTPUT = richFormatter.tokens.kit.text;

/** The only path at which `loadConfig` looks for a config file. */
const CONFIG_PATH = '.config/readyup.config.ts';

const TREE_OPTIONS = { prefix: 'rdy-compile-' };

describe(compileCommand, () => {
  beforeEach(() => {
    mockCompileConfig.mockImplementation(buildCompileResult);
  });

  afterEach(() => {
    mockCompileConfig.mockReset();
  });

  // Explicit input file tests
  it('returns 0 and writes a section heading for single file', async () => {
    using tree = createTempTree({ 'input.ts': COMPILED }, TREE_OPTIONS);
    using _cwd = pointCwdAt(tree.dir);

    const { exitCode, stdout } = await compile(['input.ts']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', undefined);
    expect(tree.exists('input.js')).toBe(true);
    expect(stdout).toContain('\u{2500}\u{2500} Compiling kit\n');
  });

  it('shows compiled indicator for a changed single file', async () => {
    using tree = createTempTree({ 'input.ts': COMPILED }, TREE_OPTIONS);
    using _cwd = pointCwdAt(tree.dir);

    const { stdout } = await compile(['input.ts']);

    expect(stdout).toContain(`${ICON_COMPILED} input.ts -> ${GLYPH_OUTPUT} `);
    expect(stdout).not.toContain('\u{2192}');
  });

  it('shows no-changes indicator for an unchanged single file', async () => {
    using tree = createTempTree({ 'input.ts': COMPILED }, TREE_OPTIONS);
    using _cwd = pointCwdAt(tree.dir);
    mockCompileConfig.mockImplementation((inputPath, outputPath) =>
      buildCompileResult(inputPath, outputPath, { changed: false }),
    );

    const { stdout } = await compile(['input.ts']);

    expect(stdout).toContain(ICON_NO_CHANGES);
    expect(stdout).toContain('no changes');
  });

  it('returns 1 when compileConfig throws', async () => {
    using tree = createTempTree({ 'input.ts': COMPILED }, TREE_OPTIONS);
    using _cwd = pointCwdAt(tree.dir);
    mockCompileConfig.mockRejectedValue(new Error('esbuild is required'));

    const { exitCode, stderr } = await compile(['input.ts']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('esbuild is required');
  });

  it('forwards an install hint from a config file whose imports could not be resolved', async () => {
    using tree = createTempTree(
      {
        [CONFIG_PATH]: "import 'rdy-test-absent-package';\nexport default {};",
        '.readyup/kits/deploy.ts': COMPILED,
      },
      TREE_OPTIONS,
    );
    using _cwd = pointCwdAt(tree.dir);

    const { error } = await compileRaising([]);

    expect(error.code).toBe('config');
    // The install command depends on the package manager detected on this machine, so only its package is asserted.
    expect(error.hint).toMatch(/^Install it with: .*rdy-test-absent-package/);
  });

  it('loads the config named by --config for a batch compile', async () => {
    using tree = createTempTree(
      {
        'custom/readyup.config.ts': buildConfigSource({ srcDir: 'custom-kits', outDir: 'custom-kits' }),
        'custom-kits/deploy.ts': COMPILED,
      },
      TREE_OPTIONS,
    );
    using _cwd = pointCwdAt(tree.dir);

    const { exitCode, stdout } = await compile(['--config', 'custom/readyup.config.ts']);

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/Compiling kits in \S*custom-kits\n/);
    expect(tree.exists('custom-kits/deploy.js')).toBe(true);
  });

  // Batch compile tests
  it('prints "Compiling kits in" header when srcDir equals outDir', async () => {
    using tree = createTempTree({ '.readyup/kits/a.ts': COMPILED }, TREE_OPTIONS);
    using _cwd = pointCwdAt(tree.dir);

    const { stdout } = await compile([]);

    expect(stdout).toContain('Compiling kits in');
    expect(stdout).not.toContain(' to ');
  });

  // `pnpm -r exec rdy compile` gives each workspace its own working directory, so a heading naming paths
  // against that one reads identically from every workspace and tells the reader nothing.
  it('names the source directory against the enclosing workspace root', async () => {
    using tree = createTempTree(
      { 'pnpm-workspace.yaml': '', 'packages/app/.readyup/kits/a.ts': COMPILED },
      TREE_OPTIONS,
    );
    using _cwd = pointCwdAt(tree.resolve('packages/app'));

    const { stdout } = await compile([]);

    expect(stdout).toContain('Compiling kits in packages/app/.readyup/kits');
  });

  // Because readyup is published, it runs in repositories that have no workspace file and in directories under
  // no repository at all. Both still need a stable anchor rather than no heading.
  it('falls back to the working directory when no workspace or repository encloses the source', async () => {
    using tree = createTempTree({ '.readyup/kits/a.ts': COMPILED }, TREE_OPTIONS);
    using _cwd = pointCwdAt(tree.dir);
    // A marker above the temp directory would anchor the heading there, which this machine must not have.
    expect(listAnchorMarkersAbove(tree.dir)).toStrictEqual([]);

    const { stdout } = await compile([]);

    expect(stdout).toContain('Compiling kits in .readyup/kits');
  });

  it('prints "from ... to ..." header when srcDir differs from outDir', async () => {
    using tree = createTempTree(
      {
        [CONFIG_PATH]: buildConfigSource({ srcDir: '.readyup/kits', outDir: '.readyup/dist' }),
        '.readyup/kits/a.ts': COMPILED,
      },
      TREE_OPTIONS,
    );
    using _cwd = pointCwdAt(tree.dir);

    const { stdout } = await compile([]);

    expect(stdout).toContain('from');
    expect(stdout).toContain('to');
  });

  it('compiles all .ts files and shows per-file status lines', async () => {
    using tree = createTempTree(
      { '.readyup/kits/a.ts': COMPILED, '.readyup/kits/b.ts': COMPILED, '.readyup/kits/readme.md': '' },
      TREE_OPTIONS,
    );
    using _cwd = pointCwdAt(tree.dir);
    mockCompileConfig.mockImplementation((inputPath, outputPath) =>
      buildCompileResult(inputPath, outputPath, { changed: path.basename(inputPath) !== 'b.ts' }),
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
    using tree = createTempTree(
      {
        [CONFIG_PATH]: buildConfigSource({ include: ['shared/*.ts'] }),
        '.readyup/kits/other.ts': COMPILED,
        '.readyup/kits/shared/deploy.ts': COMPILED,
        '.readyup/kits/shared/infra.ts': COMPILED,
      },
      TREE_OPTIONS,
    );
    using _cwd = pointCwdAt(tree.dir);

    const { exitCode } = await compile([]);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig.mock.calls.map(([inputPath]) => inputPath)).toStrictEqual([
      tree.resolve('.readyup/kits/shared/deploy.ts'),
      tree.resolve('.readyup/kits/shared/infra.ts'),
    ]);
    expect(tree.exists('.readyup/kits/other.js')).toBe(false);
  });

  // Post-compile validation tests
  it('returns 1 when post-compile validation fails for explicit input', async () => {
    using tree = createTempTree({ 'input.ts': COMPILED }, TREE_OPTIONS);
    using _cwd = pointCwdAt(tree.dir);
    mockCompileConfig.mockRejectedValue(new Error('Suite name(s) collide with checklist name(s): deploy'));

    const { exitCode, stderr } = await compile(['input.ts']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Suite name(s) collide');
    expect(tree.exists('.readyup/manifest.json')).toBe(false);
  });

  it('returns 1 when post-compile validation fails during batch compile', async () => {
    using tree = createTempTree({ '.readyup/kits/a.ts': COMPILED }, TREE_OPTIONS);
    using _cwd = pointCwdAt(tree.dir);
    mockCompileConfig.mockRejectedValue(new Error('suite "ci" references unknown checklist "missing"'));

    const { exitCode, stderr } = await compile([]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('references unknown checklist');
  });

  describe('source that is not a kit', () => {
    it('names compile.exclude when a sweep finds a source that exports no checklists', async () => {
      using tree = createTempTree({ '.readyup/kits/shared.ts': COMPILED }, TREE_OPTIONS);
      using _cwd = pointCwdAt(tree.dir);
      mockCompileConfig.mockRejectedValue(new MissingChecklistsError());

      const { stderr } = await compile([]);
      const { stdout } = await compile(['--json']);

      expect(stderr).toContain('`compile.exclude`');
      expect(JSON.parse(stdout)).toMatchObject({
        kits: [{ name: 'shared', status: 'failed', error: expect.stringContaining('`compile.exclude`') }],
      });
    });

    it('omits compile.exclude when a named file exports no checklists', async () => {
      using tree = createTempTree({ 'input.ts': COMPILED }, TREE_OPTIONS);
      using _cwd = pointCwdAt(tree.dir);
      mockCompileConfig.mockRejectedValue(new MissingChecklistsError());

      const { stderr } = await compile(['input.ts']);
      const { stdout } = await compile(['input.ts', '--json']);

      expect(stderr).toContain('must export checklists');
      expect(stderr).not.toContain('compile.exclude');
      expect(stdout).not.toContain('compile.exclude');
    });

    it('omits compile.exclude from a sweep failure of another kind', async () => {
      using tree = createTempTree({ '.readyup/kits/a.ts': COMPILED }, TREE_OPTIONS);
      using _cwd = pointCwdAt(tree.dir);
      mockCompileConfig.mockRejectedValue(new Error('a is not valid TypeScript'));

      const { stderr } = await compile([]);

      expect(stderr).toContain('a is not valid TypeScript');
      expect(stderr).not.toContain('compile.exclude');
    });
  });

  describe('sources in subdirectories', () => {
    /** A batch whose sources include a nested one sharing its basename with a top-level kit. */
    const NESTED_TREE = {
      '.readyup/kits/deploy.ts': COMPILED,
      '.readyup/kits/ops/deploy.ts': COMPILED,
    };

    it('names a nested kit by its path below the source directory', async () => {
      using tree = createTempTree(NESTED_TREE, TREE_OPTIONS);
      using _cwd = pointCwdAt(tree.dir);

      await compile([]);

      expect(readTreeManifest(tree)).toStrictEqual({
        version: 1,
        kits: [expect.objectContaining({ name: 'deploy' }), expect.objectContaining({ name: 'ops/deploy' })],
      });
    });

    it('compiles a nested source sharing its basename with a top-level kit', async () => {
      using tree = createTempTree(NESTED_TREE, TREE_OPTIONS);
      using _cwd = pointCwdAt(tree.dir);

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
      using tree = createTempTree(NESTED_TREE, TREE_OPTIONS);
      using _cwd = pointCwdAt(tree.dir);

      await compile([]);

      expect(mockCompileConfig).toHaveBeenCalledWith(
        tree.resolve('.readyup/kits/ops/deploy.ts'),
        tree.resolve('.readyup/kits/ops/deploy.js'),
      );
      expect(tree.exists('.readyup/kits/ops/deploy.js')).toBe(true);
    });
  });

  it('reports a config error when readdirSync throws during batch compile', async () => {
    // A file where the source directory belongs exists, but cannot be listed.
    using tree = createTempTree({ '.readyup/kits': '' }, TREE_OPTIONS);
    using _cwd = pointCwdAt(tree.dir);

    const { error } = await compileRaising([]);

    expect(error.code).toBe('config');
    expect(error.message).toContain('Failed to read source directory');
    expect(error.message).toContain('ENOTDIR');
  });

  it('names a nested single-file compile by its bundle below the output directory', async () => {
    using tree = createTempTree(
      {
        '.readyup/kits/team-a/deploy.ts': COMPILED,
        '.readyup/manifest.json': JSON.stringify({
          version: 1,
          kits: [{ name: 'deploy', description: 'The top-level kit' }],
        }),
      },
      TREE_OPTIONS,
    );
    using _cwd = pointCwdAt(tree.dir);

    await compile(['.readyup/kits/team-a/deploy.ts']);

    expect(readTreeManifest(tree)).toStrictEqual({
      version: 1,
      kits: [
        { name: 'deploy', description: 'The top-level kit' },
        expect.objectContaining({ name: 'team-a/deploy', path: 'kits/team-a/deploy.js' }),
      ],
    });
  });

  it('names a single-file compile from the output directory of the config that --config names', async () => {
    using tree = createTempTree(
      {
        'custom/readyup.config.ts': buildConfigSource({ srcDir: 'custom/kits', outDir: 'custom/kits' }),
        'custom/kits/ops/deploy.ts': COMPILED,
      },
      TREE_OPTIONS,
    );
    using _cwd = pointCwdAt(tree.dir);

    await compile(['custom/kits/ops/deploy.ts', '--config', 'custom/readyup.config.ts']);

    expect(readTreeManifest(tree)).toStrictEqual({
      version: 1,
      kits: [expect.objectContaining({ name: 'ops/deploy' })],
    });
  });

  // esbuild reports the path to which it resolved a module, so a symlink above the kit leaves the closure
  // keyed on a path that the command was never handed.
  it('finds the entry point record under the real path of the source that it was given', async () => {
    using tree = createTempTree({ 'real/kits/deploy.ts': COMPILED }, TREE_OPTIONS);
    using _cwd = pointCwdAt(tree.dir);
    tree.symlink('linked', 'real');
    mockCompileConfig.mockImplementation((inputPath, outputPath) =>
      buildCompileResult(inputPath, outputPath, { sourceHash: '7ea1fa7e' }),
    );

    await compile(['linked/kits/deploy.ts']);

    expect(readTreeManifest(tree).kits).toStrictEqual([expect.objectContaining({ sourceHash: '7ea1fa7e' })]);
  });
});

// region | Helpers

/** Returns the source of a config file that exports `compile` as its compile settings. */
function buildConfigSource(compile: Record<string, unknown>): string {
  return `export default ${JSON.stringify({ compile })};\n`;
}

/** Returns the workspace and repository markers found in the directories above `dir`. */
function listAnchorMarkersAbove(dir: string): string[] {
  const found: string[] = [];
  let directory = dir;
  do {
    directory = path.dirname(directory);
    for (const marker of ['pnpm-workspace.yaml', '.git']) {
      const markerPath = path.join(directory, marker);
      if (existsSync(markerPath)) found.push(markerPath);
    }
  } while (directory !== path.dirname(directory));
  return found;
}

// endregion | Helpers
