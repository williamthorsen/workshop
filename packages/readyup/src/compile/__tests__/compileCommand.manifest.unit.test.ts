import path from 'node:path';

import { createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCompileConfig = vi.hoisted(() => vi.fn<(inputPath: string, outputPath?: string) => Promise<CompileResult>>());

// The bundler and the import of its output are mocked; configs, manifests, and the drift gate read the tree.
vi.mock(import('../compileConfig.ts'), () => ({
  compileConfig: mockCompileConfig,
}));

import { VERSION } from '../../version.ts';
import { compileCommand } from '../compileCommand.ts';
import type { CompileResult } from '../compileConfig.ts';
import {
  buildCompileResult,
  COMPILED,
  ESBUILD_VERSION,
  hashOf,
  kitMetadata,
  SOURCE_HASH,
} from '../test-utils/compile-result-fixtures.ts';
import { compile, compileRaising } from '../test-utils/compile-runners.ts';
import { readTreeManifest } from '../test-utils/readTreeManifest.ts';
import type { KitMetadata } from '../validateCompiledOutput.ts';

/** A single-file project holding one kit source, without a manifest at the default location. */
const SINGLE_TREE = { 'deploy.ts': COMPILED };

/** A batch project holding two kit sources in the default source directory, never compiled. */
const TWO_KIT_TREE = { '.readyup/kits/alpha.ts': COMPILED, '.readyup/kits/beta.ts': COMPILED };

/** A batch project holding one kit source in the default source directory, never compiled. */
const ONE_KIT_TREE = { '.readyup/kits/a.ts': COMPILED };

describe(compileCommand, () => {
  beforeEach(() => {
    mockCompileConfig.mockImplementation(buildCompileResult);
  });

  afterEach(() => {
    mockCompileConfig.mockReset();
  });

  describe('manifest checklist names', () => {
    it('records the checklist names and check names declared by the compiled kit', async () => {
      using tree = createTempTree(SINGLE_TREE, { prefix: 'rdy-compile-manifest-' });
      using _cwd = pointCwdAt(tree.dir);
      mockCompileConfig.mockImplementation((inputPath, outputPath) =>
        buildCompileResult(inputPath, outputPath, {
          metadata: kitMetadata({
            checklistChecks: [
              { checklist: 'preflight', checks: ['Node.js runtime is v24 or later'] },
              { checklist: 'deploy', checks: [] },
            ],
            checklists: ['preflight', 'deploy'],
          }),
        }),
      );

      await compile(['deploy.ts']);

      expect(readTreeManifest(tree)).toStrictEqual({
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
      using tree = createTempTree(SINGLE_TREE, { prefix: 'rdy-compile-manifest-' });
      using _cwd = pointCwdAt(tree.dir);

      await compile(['deploy.ts']);

      const manifest = readTreeManifest(tree);
      expect(manifest.kits[0]).not.toHaveProperty('checklists');
      expect(manifest.kits[0]).not.toHaveProperty('checklistChecks');
    });
  });

  describe('manifest toolchain record', () => {
    it('records bundled dependencies on the entry when the compile reports them', async () => {
      using tree = createTempTree(SINGLE_TREE, { prefix: 'rdy-compile-manifest-' });
      using _cwd = pointCwdAt(tree.dir);
      mockCompileConfig.mockImplementation(async (inputPath, outputPath) => ({
        ...(await buildCompileResult(inputPath, outputPath)),
        bundledDependencies: { picomatch: '4.0.2', zod: '4.0.5' },
      }));

      await compile(['deploy.ts']);

      expect(readTreeManifest(tree)).toStrictEqual({
        version: 1,
        kits: [expect.objectContaining({ bundledDependencies: { picomatch: '4.0.2', zod: '4.0.5' } })],
      });
    });

    it('omits the bundledDependencies field for a kit that bundles nothing', async () => {
      using tree = createTempTree(SINGLE_TREE, { prefix: 'rdy-compile-manifest-' });
      using _cwd = pointCwdAt(tree.dir);

      await compile(['deploy.ts']);

      expect(readTreeManifest(tree).kits[0]).not.toHaveProperty('bundledDependencies');
    });
  });

  // Manifest generation tests
  it('writes manifest after batch compile with kit entries including location fields', async () => {
    using tree = createTempTree(TWO_KIT_TREE, { prefix: 'rdy-compile-manifest-' });
    using _cwd = pointCwdAt(tree.dir);
    arrangeTwoKitBatch({ alphaMetadata: kitMetadata({ description: 'Alpha checks' }) });

    await compile([]);

    expect(readTreeManifest(tree)).toStrictEqual({
      version: 1,
      kits: [
        {
          esbuildVersion: ESBUILD_VERSION,
          inputs: [{ hash: SOURCE_HASH, kind: 'module', path: 'kits/alpha.ts' }],
          name: 'alpha',
          description: 'Alpha checks',
          path: 'kits/alpha.js',
          readyupVersion: VERSION,
          source: 'kits/alpha.ts',
          sourceHash: SOURCE_HASH,
          targetHash: hashOf(COMPILED),
        },
        {
          esbuildVersion: ESBUILD_VERSION,
          inputs: [{ hash: SOURCE_HASH, kind: 'module', path: 'kits/beta.ts' }],
          name: 'beta',
          path: 'kits/beta.js',
          readyupVersion: VERSION,
          source: 'kits/beta.ts',
          sourceHash: SOURCE_HASH,
          targetHash: hashOf(COMPILED),
        },
      ],
    });
  });

  it('skips manifest generation when --skip-manifest is set', async () => {
    using tree = createTempTree(ONE_KIT_TREE, { prefix: 'rdy-compile-manifest-' });
    using _cwd = pointCwdAt(tree.dir);

    await compile(['--skip-manifest']);

    expect(tree.exists('.readyup/kits/a.js')).toBe(true);
    expect(tree.exists('.readyup/manifest.json')).toBe(false);
  });

  it('uses custom manifest path from --manifest flag', async () => {
    using tree = createTempTree(ONE_KIT_TREE, { prefix: 'rdy-compile-manifest-' });
    using _cwd = pointCwdAt(tree.dir);

    await compile(['--manifest=custom/manifest.json']);

    expect(readTreeManifest(tree, 'custom/manifest.json').kits).toStrictEqual([
      expect.objectContaining({ name: 'a', path: '../.readyup/kits/a.js' }),
    ]);
    expect(tree.exists('.readyup/manifest.json')).toBe(false);
  });

  it('records an inlined JSON file with the specifier that produced its projection', async () => {
    using tree = createTempTree(SINGLE_TREE, { prefix: 'rdy-compile-manifest-' });
    using _cwd = pointCwdAt(tree.dir);
    mockCompileConfig.mockImplementation(async (inputPath, outputPath) => {
      const result = await buildCompileResult(inputPath, outputPath);
      return {
        ...result,
        inputs: [
          ...result.inputs,
          {
            hash: 'feedface',
            kind: 'inline',
            path: path.resolve('package.json'),
            paths: ['version', ['engines', 'node']],
          },
        ],
      };
    });

    await compile(['deploy.ts']);

    expect(readTreeManifest(tree).kits).toStrictEqual([
      expect.objectContaining({
        inputs: [
          { hash: SOURCE_HASH, kind: 'module', path: '../deploy.ts' },
          { hash: 'feedface', kind: 'inline', path: '../package.json', paths: ['version', ['engines', 'node']] },
        ],
      }),
    ]);
  });

  it('takes the source hash of a single-file compile from the entry point record', async () => {
    using tree = createTempTree(SINGLE_TREE, { prefix: 'rdy-compile-manifest-' });
    using _cwd = pointCwdAt(tree.dir);
    mockCompileConfig.mockImplementation((inputPath, outputPath) =>
      buildCompileResult(inputPath, outputPath, { sourceHash: 'e4721e50' }),
    );

    await compile(['deploy.ts']);

    expect(readTreeManifest(tree).kits).toStrictEqual([expect.objectContaining({ sourceHash: 'e4721e50' })]);
  });

  it('records a distinct source hash per kit in a batch compile', async () => {
    using tree = createTempTree(TWO_KIT_TREE, { prefix: 'rdy-compile-manifest-' });
    using _cwd = pointCwdAt(tree.dir);
    arrangeTwoKitBatch({ alphaHash: 'a1a1a1a1', betaHash: 'b2b2b2b2' });

    await compile([]);

    expect(readTreeManifest(tree).kits.map((kit) => kit.sourceHash)).toStrictEqual(['a1a1a1a1', 'b2b2b2b2']);
  });

  it('leaves a drift-skipped kit its prior entry, source hash included', async () => {
    const recordedAlpha = {
      name: 'alpha',
      path: 'kits/alpha.js',
      readyupVersion: VERSION,
      source: 'kits/alpha.ts',
      sourceHash: '01d5abce',
      targetHash: hashOf(COMPILED),
    };
    // Alpha's bundle was edited after its hash was recorded; beta was never compiled.
    using tree = createTempTree(
      {
        ...TWO_KIT_TREE,
        '.readyup/kits/alpha.js': 'export default { edited: true };',
        '.readyup/manifest.json': JSON.stringify({ version: 1, kits: [recordedAlpha] }),
      },
      { prefix: 'rdy-compile-manifest-' },
    );
    using _cwd = pointCwdAt(tree.dir);

    await compile([]);

    expect(readTreeManifest(tree)).toStrictEqual({
      version: 1,
      kits: [recordedAlpha, expect.objectContaining({ name: 'beta' })],
    });
  });

  it('reports a config error when writeManifest throws during batch compile', async () => {
    // A directory where the manifest belongs fails the write; it also fails the read, which warns and continues.
    using tree = createTempTree(
      { ...ONE_KIT_TREE, '.readyup/manifest.json/.keep': '' },
      { prefix: 'rdy-compile-manifest-' },
    );
    using _cwd = pointCwdAt(tree.dir);

    const { error } = await compileRaising([]);

    expect(error.code).toBe('config');
    expect(error.message).toContain('Cannot write manifest');
    expect(error.message).toContain('EISDIR');
  });

  it('populates readyupVersion from the runner version on every batch-compile entry', async () => {
    using tree = createTempTree(TWO_KIT_TREE, { prefix: 'rdy-compile-manifest-' });
    using _cwd = pointCwdAt(tree.dir);

    await compile([]);

    const { kits } = readTreeManifest(tree);
    expect(kits).toHaveLength(2);
    for (const kit of kits) {
      expect(kit.readyupVersion).toBe(VERSION);
    }
  });

  it('warns on stderr when the existing manifest is unreadable during batch compile', async () => {
    using tree = createTempTree(
      { '.readyup/kits/alpha.ts': COMPILED, '.readyup/manifest.json': '{ not json' },
      { prefix: 'rdy-compile-manifest-' },
    );
    using _cwd = pointCwdAt(tree.dir);

    const { stderr } = await compile([]);

    expect(stderr).toContain('Manifest file contains invalid JSON');
    expect(stderr).toContain('drift gate skipped');
  });

  it('is silent when the manifest is missing during batch compile', async () => {
    using tree = createTempTree({ '.readyup/kits/alpha.ts': COMPILED }, { prefix: 'rdy-compile-manifest-' });
    using _cwd = pointCwdAt(tree.dir);

    const { stderr } = await compile([]);

    expect(stderr).not.toContain('drift gate skipped');
  });
});

// region | Helpers

/** Arranges a two-kit batch in which both kits compile successfully, each with the source hash and metadata given. */
function arrangeTwoKitBatch(
  options: { alphaHash?: string; alphaMetadata?: KitMetadata; betaHash?: string } = {},
): void {
  // Keyed by the source rather than queued, so that the next kit does not receive the result of a kit skipped by the
  // sweep.
  mockCompileConfig.mockImplementation((inputPath, outputPath) => {
    const isAlpha = path.basename(inputPath) === 'alpha.ts';
    const sourceHash = isAlpha ? options.alphaHash : options.betaHash;
    const metadata = isAlpha ? options.alphaMetadata : undefined;

    return buildCompileResult(inputPath, outputPath, {
      ...(sourceHash !== undefined && { sourceHash }),
      ...(metadata !== undefined && { metadata }),
    });
  });
}

// endregion | Helpers
