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
import { compile } from '../test-utils/compile-runners.ts';
import { readTreeManifest } from '../test-utils/readTreeManifest.ts';

describe(compileCommand, () => {
  beforeEach(() => {
    mockCompileConfig.mockImplementation(buildCompileResult);
  });

  afterEach(() => {
    mockCompileConfig.mockReset();
  });

  it('upserts manifest entry for single-file compile with location fields', async () => {
    using tree = createTempTree(
      {
        'deploy.ts': COMPILED,
        '.readyup/manifest.json': JSON.stringify({
          version: 1,
          kits: [{ name: 'default', description: 'Default checks' }],
        }),
      },
      { prefix: 'rdy-compile-upsert-' },
    );
    using _cwd = pointCwdAt(tree.dir);
    arrangeDescription('Deploy checks');

    await compile(['deploy.ts']);

    expect(readTreeManifest(tree)).toStrictEqual({
      version: 1,
      kits: [{ name: 'default', description: 'Default checks' }, buildDeployEntry({ description: 'Deploy checks' })],
    });
  });

  it('creates new manifest for single-file compile when no manifest exists', async () => {
    using tree = createTempTree({ 'deploy.ts': COMPILED }, { prefix: 'rdy-compile-upsert-' });
    using _cwd = pointCwdAt(tree.dir);

    await compile(['deploy.ts']);

    expect(readTreeManifest(tree)).toStrictEqual({ version: 1, kits: [buildDeployEntry()] });
  });

  it('replaces existing entry when upserting for single-file compile', async () => {
    using tree = createTempTree(
      {
        'deploy.ts': COMPILED,
        '.readyup/manifest.json': JSON.stringify({ version: 1, kits: [{ name: 'deploy', description: 'Old' }] }),
      },
      { prefix: 'rdy-compile-upsert-' },
    );
    using _cwd = pointCwdAt(tree.dir);
    arrangeDescription('Updated');

    await compile(['deploy.ts']);

    expect(readTreeManifest(tree)).toStrictEqual({
      version: 1,
      kits: [buildDeployEntry({ description: 'Updated' })],
    });
  });

  it('skips manifest for single-file compile when --skip-manifest is set', async () => {
    // A manifest that cannot be parsed would warn on any read, so silence shows that it was neither read nor written.
    using tree = createTempTree(
      { 'input.ts': COMPILED, '.readyup/manifest.json': '{ not json' },
      { prefix: 'rdy-compile-upsert-' },
    );
    using _cwd = pointCwdAt(tree.dir);

    const { stderr } = await compile(['input.ts', '--skip-manifest']);

    expect(tree.exists('input.js')).toBe(true);
    expect(tree.read('.readyup/manifest.json')).toBe('{ not json');
    expect(stderr).not.toContain('Warning:');
  });

  it('writes warning to stderr when upsert encounters non-missing-file error', async () => {
    using tree = createTempTree(
      { 'deploy.ts': COMPILED, '.readyup/manifest.json': JSON.stringify({ version: 1, kits: 'bad data' }) },
      { prefix: 'rdy-compile-upsert-' },
    );
    using _cwd = pointCwdAt(tree.dir);

    const { stderr } = await compile(['deploy.ts']);

    expect(stderr).toContain('Warning:');
    expect(stderr).toContain('Invalid manifest schema');
    // Still writes the manifest despite the warning
    expect(readTreeManifest(tree)).toStrictEqual({ version: 1, kits: [buildDeployEntry()] });
  });

  it('uses custom manifest path from --manifest flag for single-file compile', async () => {
    using tree = createTempTree({ 'deploy.ts': COMPILED }, { prefix: 'rdy-compile-upsert-' });
    using _cwd = pointCwdAt(tree.dir);

    await compile(['deploy.ts', '--manifest=custom/manifest.json']);

    expect(readTreeManifest(tree, 'custom/manifest.json').kits).toStrictEqual([
      expect.objectContaining({ name: 'deploy', path: '../deploy.js' }),
    ]);
    expect(tree.exists('.readyup/manifest.json')).toBe(false);
  });

  it('populates readyupVersion when upserting a single-file compile entry', async () => {
    using tree = createTempTree({ 'deploy.ts': COMPILED }, { prefix: 'rdy-compile-upsert-' });
    using _cwd = pointCwdAt(tree.dir);

    await compile(['deploy.ts']);

    const deployEntry = readTreeManifest(tree).kits.find((kit) => kit.name === 'deploy');
    expect(deployEntry?.readyupVersion).toBe(VERSION);
  });

  it('maintains alphabetical order when upserting manifest entries', async () => {
    using tree = createTempTree(
      {
        'alpha.ts': COMPILED,
        '.readyup/manifest.json': JSON.stringify({ version: 1, kits: [{ name: 'charlie' }, { name: 'beta' }] }),
      },
      { prefix: 'rdy-compile-upsert-' },
    );
    using _cwd = pointCwdAt(tree.dir);

    await compile(['alpha.ts']);

    expect(readTreeManifest(tree)).toStrictEqual({
      version: 1,
      kits: [expect.objectContaining({ name: 'alpha' }), { name: 'beta' }, { name: 'charlie' }],
    });
  });
});

// region | Helpers

/** Arranges every compile to report a kit whose metadata contains `description`. */
function arrangeDescription(description: string): void {
  mockCompileConfig.mockImplementation((inputPath, outputPath) =>
    buildCompileResult(inputPath, outputPath, { metadata: kitMetadata({ description }) }),
  );
}

/** Returns the manifest entry that compiling `deploy.ts` beside the default manifest location records. */
function buildDeployEntry(fields: { description?: string } = {}): Record<string, unknown> {
  return {
    esbuildVersion: ESBUILD_VERSION,
    inputs: [{ hash: SOURCE_HASH, kind: 'module', path: '../deploy.ts' }],
    name: 'deploy',
    ...fields,
    path: '../deploy.js',
    readyupVersion: VERSION,
    source: '../deploy.ts',
    sourceHash: SOURCE_HASH,
    targetHash: hashOf(COMPILED),
  };
}

// endregion | Helpers
