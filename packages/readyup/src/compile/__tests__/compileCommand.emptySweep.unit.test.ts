import { createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCompileConfig = vi.hoisted(() => vi.fn<(inputPath: string, outputPath?: string) => Promise<CompileResult>>());

// The bundler and the import of its output are mocked; configs, manifests, the drift gate, and discovery use the tree.
vi.mock(import('../compileConfig.ts'), () => ({
  compileConfig: mockCompileConfig,
}));

import { CompileOutputSchema } from '../../schemas/compileOutputSchema.ts';
import { VERSION } from '../../version.ts';
import { compileCommand } from '../compileCommand.ts';
import type { CompileResult } from '../compileConfig.ts';
import { buildCompileResult } from '../test-utils/compile-result-fixtures.ts';
import { compile, compileForPayload } from '../test-utils/compile-runners.ts';
import { readTreeManifest } from '../test-utils/readTreeManifest.ts';

/**
 * A manifest that lists one kit recording no bundle path, which a sweep that finds no sources drops without a removal
 * line, so a manifest that the sweep rewrote is told apart from the one that it started with.
 */
const STALE_MANIFEST = JSON.stringify({ version: 1, kits: [{ name: 'gone' }] });

/** A source directory that contains a file, but no `.ts` file. */
const NON_TS_SOURCES = { '.readyup/kits/readme.md': '# Kits' };

/** Two kit sources, swept in the order alpha then beta. */
const MIXED_BATCH_SOURCES = {
  '.readyup/kits/alpha.ts': 'export default {};',
  '.readyup/kits/beta.ts': 'export default {};',
};

/**
 * A prior entry for alpha whose recorded bundle is absent, which the drift gate reads as `missing` and lets compile,
 * so that a failed compile is what keeps the entry.
 */
const RECORDED_ALPHA = {
  name: 'alpha',
  path: 'kits/alpha.js',
  readyupVersion: VERSION,
  source: 'kits/alpha.ts',
  targetHash: 'aaaa1111',
};

describe(compileCommand, () => {
  beforeEach(() => {
    mockCompileConfig.mockImplementation(buildCompileResult);
  });

  afterEach(() => {
    mockCompileConfig.mockReset();
  });

  describe('sweep that finds no kits', () => {
    it('writes no manifest when the source directory is absent and no manifest exists', async () => {
      using tree = createTempTree({}, { prefix: 'rdy-compile-empty-' });
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stdout } = await compile([]);

      expect(exitCode).toBe(0);
      expect(mockCompileConfig).not.toHaveBeenCalled();
      expect(tree.exists('.readyup/manifest.json')).toBe(false);
      expect(stdout).toContain('Source directory not found: .readyup/kits; manifest not written');
      expect(stdout).toContain('Hint: Run `rdy init` to scaffold a kit.');
    });

    it('writes no manifest when the source directory holds no .ts files and no manifest exists', async () => {
      using tree = createTempTree(NON_TS_SOURCES, { prefix: 'rdy-compile-empty-' });
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stdout } = await compile([]);

      expect(exitCode).toBe(0);
      expect(tree.exists('.readyup/manifest.json')).toBe(false);
      expect(stdout).toContain('No .ts files found in .readyup/kits; manifest not written');
      expect(stdout).toContain('Hint: Run `rdy init` to scaffold a kit.');
    });

    it('names the configured source directory when `rdy init` would not scaffold into it', async () => {
      using tree = createTempTree(
        { '.config/readyup.config.ts': "export default { compile: { srcDir: 'kits/src', outDir: 'kits/src' } };" },
        { prefix: 'rdy-compile-empty-' },
      );
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stdout } = await compile([]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Hint: Add a kit source to kits/src.');
    });

    it('carries the next step as the payload hint under --json', async () => {
      using tree = createTempTree({}, { prefix: 'rdy-compile-empty-' });
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stdout } = await compile(['--json']);

      expect(exitCode).toBe(0);
      expect(CompileOutputSchema.parse(JSON.parse(stdout))).toStrictEqual({
        schemaVersion: 1,
        passed: true,
        kits: [],
        hint: 'Run `rdy init` to scaffold a kit.',
      });
    });

    it('omits the hint from the payload when a manifest exists', async () => {
      using tree = createTempTree({ '.readyup/manifest.json': STALE_MANIFEST }, { prefix: 'rdy-compile-empty-' });
      using _cwd = pointCwdAt(tree.dir);

      const payload = CompileOutputSchema.parse(await compileForPayload([]));

      expect(payload).not.toHaveProperty('hint');
    });

    it('empties an existing manifest when the source directory is absent', async () => {
      using tree = createTempTree({ '.readyup/manifest.json': STALE_MANIFEST }, { prefix: 'rdy-compile-empty-' });
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stdout } = await compile([]);

      expect(exitCode).toBe(0);
      expect(readTreeManifest(tree)).toStrictEqual({ version: 1, kits: [] });
      expect(stdout).toBe('Source directory not found: .readyup/kits; manifest now lists no kits\n');
    });

    it('empties an existing manifest when the source directory holds no .ts files', async () => {
      using tree = createTempTree(
        { ...NON_TS_SOURCES, '.readyup/manifest.json': STALE_MANIFEST },
        { prefix: 'rdy-compile-empty-' },
      );
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stdout } = await compile([]);

      expect(exitCode).toBe(0);
      expect(readTreeManifest(tree)).toStrictEqual({ version: 1, kits: [] });
      expect(stdout).toContain('manifest now lists no kits');
    });

    it('gates on the path named by --manifest rather than the default', async () => {
      // Seed the default path, so that a gate reading it would write the manifest.
      using tree = createTempTree({ '.readyup/manifest.json': STALE_MANIFEST }, { prefix: 'rdy-compile-empty-' });
      using _cwd = pointCwdAt(tree.dir);

      const { stdout } = await compile(['--manifest', 'custom/manifest.json']);

      expect(stdout).toContain('manifest not written');
      expect(tree.exists('custom/manifest.json')).toBe(false);
      expect(tree.read('.readyup/manifest.json')).toBe(STALE_MANIFEST);
    });

    it('omits the manifest clause under --skip-manifest when the source directory is absent', async () => {
      using tree = createTempTree({ '.readyup/manifest.json': STALE_MANIFEST }, { prefix: 'rdy-compile-empty-' });
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stdout } = await compile(['--skip-manifest']);

      expect(exitCode).toBe(0);
      expect(tree.read('.readyup/manifest.json')).toBe(STALE_MANIFEST);
      expect(stdout).toBe('Source directory not found: .readyup/kits\n');
    });

    it('omits the manifest clause under --skip-manifest when the directory holds no .ts files', async () => {
      using tree = createTempTree(
        { ...NON_TS_SOURCES, '.readyup/manifest.json': STALE_MANIFEST },
        { prefix: 'rdy-compile-empty-' },
      );
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stdout } = await compile(['--skip-manifest']);

      expect(exitCode).toBe(0);
      expect(tree.read('.readyup/manifest.json')).toBe(STALE_MANIFEST);
      expect(stdout).toBe('No .ts files found in .readyup/kits\n');
    });
  });

  describe('sweep completion', () => {
    it('compiles the kits after a failed one instead of abandoning the sweep', async () => {
      using tree = createTempTree(MIXED_BATCH_SOURCES, { prefix: 'rdy-compile-empty-' });
      using _cwd = pointCwdAt(tree.dir);
      arrangeFirstCompileFailure();

      const { exitCode, stdout, stderr } = await compile([]);

      expect(exitCode).toBe(1);
      expect(mockCompileConfig).toHaveBeenCalledTimes(2);
      expect(stderr).toContain('rdy: cannot compile alpha.ts');
      expect(stdout).toContain('beta.ts');
    });

    it('reports how many kits failed once the sweep finishes', async () => {
      using tree = createTempTree(MIXED_BATCH_SOURCES, { prefix: 'rdy-compile-empty-' });
      using _cwd = pointCwdAt(tree.dir);
      arrangeFirstCompileFailure();

      const { stdout } = await compile([]);

      expect(stdout).toContain('1 of 2 kits failed to compile.');
    });

    it('writes a manifest when sources are found but every one fails to compile', async () => {
      using tree = createTempTree(MIXED_BATCH_SOURCES, { prefix: 'rdy-compile-empty-' });
      using _cwd = pointCwdAt(tree.dir);
      mockCompileConfig.mockRejectedValue(new Error('not valid TypeScript'));

      const { exitCode } = await compile([]);

      expect(exitCode).toBe(1);
      expect(readTreeManifest(tree)).toStrictEqual({ version: 1, kits: [] });
    });

    it('leaves a failed kit out of the manifest rather than recording it as compiled', async () => {
      using tree = createTempTree(MIXED_BATCH_SOURCES, { prefix: 'rdy-compile-empty-' });
      using _cwd = pointCwdAt(tree.dir);
      arrangeFirstCompileFailure();

      await compile([]);

      expect(readTreeManifest(tree)).toStrictEqual({
        version: 1,
        kits: [expect.objectContaining({ name: 'beta' })],
      });
    });

    it('keeps the manifest entry that a failed kit already had', async () => {
      using tree = createTempTree(
        { ...MIXED_BATCH_SOURCES, '.readyup/manifest.json': JSON.stringify({ version: 1, kits: [RECORDED_ALPHA] }) },
        { prefix: 'rdy-compile-empty-' },
      );
      using _cwd = pointCwdAt(tree.dir);
      arrangeFirstCompileFailure();

      await compile([]);

      expect(readTreeManifest(tree)).toStrictEqual({
        version: 1,
        kits: [RECORDED_ALPHA, expect.objectContaining({ name: 'beta' })],
      });
    });

    it('reports the failure even though the kit keeps its entry', async () => {
      using tree = createTempTree(
        { ...MIXED_BATCH_SOURCES, '.readyup/manifest.json': JSON.stringify({ version: 1, kits: [RECORDED_ALPHA] }) },
        { prefix: 'rdy-compile-empty-' },
      );
      using _cwd = pointCwdAt(tree.dir);
      arrangeFirstCompileFailure();

      const { exitCode, stderr } = await compile([]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('rdy: cannot compile alpha.ts');
    });
  });

  it('treats an include glob matching only non-.ts files as a sweep that finds no kits', async () => {
    using tree = createTempTree(
      {
        '.config/readyup.config.ts': "export default { compile: { include: ['data/*'] } };",
        '.readyup/kits/data/config.json': '{}',
        '.readyup/kits/data/readme.md': '# Data',
        '.readyup/manifest.json': STALE_MANIFEST,
      },
      { prefix: 'rdy-compile-empty-' },
    );
    using _cwd = pointCwdAt(tree.dir);

    const { exitCode } = await compile([]);

    expect(exitCode).toBe(0);
    expect(readTreeManifest(tree)).toStrictEqual({ version: 1, kits: [] });
  });
});

// region | Helpers

/** Arranges the next compile to fail, so that in a two-kit batch alpha fails and beta compiles into the tree. */
function arrangeFirstCompileFailure(): void {
  mockCompileConfig.mockRejectedValueOnce(new Error('alpha is not valid TypeScript'));
}

// endregion | Helpers
