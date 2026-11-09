import { createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCompileConfig = vi.hoisted(() => vi.fn<(inputPath: string, outputPath?: string) => Promise<CompileResult>>());

// The bundler and the import of its output are mocked; configs, manifests, and the drift gate read the tree.
vi.mock(import('../compileConfig.ts'), () => ({
  compileConfig: mockCompileConfig,
}));

import { richFormatter } from '../../layout/formatter.ts';
import { compileCommand } from '../compileCommand.ts';
import type { CompileResult } from '../compileConfig.ts';
import { buildCompileResult, COMPILED, hashOf, SOURCE_HASH } from '../test-utils/compile-result-fixtures.ts';
import { compile } from '../test-utils/compile-runners.ts';
import { readTreeManifest } from '../test-utils/readTreeManifest.ts';

const ICON_DRIFT = richFormatter.tokens.failedWarn.text;

/** Contents of a bundle edited by hand after the manifest recorded the hash of `COMPILED`. */
const EDITED = 'export default { edited: true };';

/** A single-file project whose bundle has been edited since the manifest recorded its hash. */
const DRIFTED_SINGLE_TREE = {
  'deploy.js': EDITED,
  'deploy.ts': COMPILED,
  '.readyup/manifest.json': JSON.stringify({
    version: 1,
    kits: [{ name: 'deploy', path: '../deploy.js', targetHash: hashOf(COMPILED) }],
  }),
};

describe(compileCommand, () => {
  beforeEach(() => {
    mockCompileConfig.mockImplementation(buildCompileResult);
  });

  afterEach(() => {
    mockCompileConfig.mockReset();
  });

  // Drift-gate tests
  it('skips single-file compile with drift and returns 1 without invoking compileConfig', async () => {
    using tree = createTempTree(DRIFTED_SINGLE_TREE, { prefix: 'rdy-compile-drift-' });
    using _cwd = pointCwdAt(tree.dir);
    const manifestBefore = tree.read('.readyup/manifest.json');

    const { exitCode, stdout } = await compile(['deploy.ts']);

    expect(exitCode).toBe(1);
    expect(mockCompileConfig).not.toHaveBeenCalled();
    expect(tree.read('.readyup/manifest.json')).toBe(manifestBefore);
    expect(tree.read('deploy.js')).toBe(EDITED);
    expect(stdout).toContain(
      `${ICON_DRIFT} deploy.ts\n   drift in deploy.js: expected ${hashOf(COMPILED)}, got ${hashOf(EDITED)}\n`,
    );
    expect(stdout).toContain('Re-run with --force');
  });

  it('bypasses drift gate with --force on single-file compile', async () => {
    using tree = createTempTree(DRIFTED_SINGLE_TREE, { prefix: 'rdy-compile-drift-' });
    using _cwd = pointCwdAt(tree.dir);

    const { exitCode, stdout } = await compile(['deploy.ts', '--force']);

    expect(exitCode).toBe(0);
    expect(stdout).not.toContain('drift in');
    expect(mockCompileConfig).toHaveBeenCalledTimes(1);
    expect(tree.read('deploy.js')).toBe(COMPILED);
    expect(readTreeManifest(tree).kits).toStrictEqual([
      expect.objectContaining({ name: 'deploy', source: '../deploy.ts', sourceHash: SOURCE_HASH }),
    ]);
  });

  it('skips drifted kits during batch compile and preserves their manifest entries', async () => {
    // alpha drifts; beta is ok.
    using tree = createTempTree(
      {
        '.readyup/kits/alpha.js': EDITED,
        '.readyup/kits/alpha.ts': COMPILED,
        '.readyup/kits/beta.js': COMPILED,
        '.readyup/kits/beta.ts': COMPILED,
        '.readyup/manifest.json': JSON.stringify({
          version: 1,
          kits: [
            { name: 'alpha', path: 'kits/alpha.js', source: 'kits/alpha.ts', targetHash: hashOf(COMPILED) },
            { name: 'beta', path: 'kits/beta.js', source: 'kits/beta.ts', targetHash: hashOf(COMPILED) },
          ],
        }),
      },
      { prefix: 'rdy-compile-drift-' },
    );
    using _cwd = pointCwdAt(tree.dir);

    const { exitCode, stdout } = await compile([]);

    expect(exitCode).toBe(1);
    expect(mockCompileConfig).toHaveBeenCalledTimes(1); // only beta compiled
    expect(mockCompileConfig).toHaveBeenCalledWith(tree.resolve('.readyup/kits/beta.ts'), expect.any(String));
    expect(stdout).toContain(`${ICON_DRIFT} alpha.ts\n   drift in alpha.js:`);
    expect(stdout).toContain('1 of 2 kits skipped due to drift');
    expect(tree.read('.readyup/kits/alpha.js')).toBe(EDITED);

    const [alphaEntry, betaEntry] = readTreeManifest(tree).kits;
    // The recompiled entry gains the fields that a compile records; the preserved one keeps only its prior fields.
    expect(alphaEntry).toStrictEqual({
      name: 'alpha',
      path: 'kits/alpha.js',
      source: 'kits/alpha.ts',
      targetHash: hashOf(COMPILED),
    });
    expect(betaEntry).toStrictEqual(
      expect.objectContaining({ name: 'beta', sourceHash: SOURCE_HASH, targetHash: hashOf(COMPILED) }),
    );
  });

  it('compiles all kits when --force is passed during batch compile with drift', async () => {
    using tree = createTempTree(
      {
        '.readyup/kits/alpha.js': EDITED,
        '.readyup/kits/alpha.ts': COMPILED,
        '.readyup/manifest.json': JSON.stringify({
          version: 1,
          kits: [{ name: 'alpha', path: 'kits/alpha.js', source: 'kits/alpha.ts', targetHash: hashOf(COMPILED) }],
        }),
      },
      { prefix: 'rdy-compile-drift-' },
    );
    using _cwd = pointCwdAt(tree.dir);

    const { exitCode, stdout } = await compile(['--force']);

    expect(exitCode).toBe(0);
    expect(stdout).not.toContain('drift in');
    expect(mockCompileConfig).toHaveBeenCalledTimes(1);
    expect(stdout).not.toContain('skipped due to drift');
    expect(tree.read('.readyup/kits/alpha.js')).toBe(COMPILED);
  });

  it('does not emit drift footer when no kits were skipped', async () => {
    using tree = createTempTree(
      {
        '.readyup/kits/a.js': COMPILED,
        '.readyup/kits/a.ts': COMPILED,
        '.readyup/manifest.json': JSON.stringify({
          version: 1,
          kits: [{ name: 'a', path: 'kits/a.js', source: 'kits/a.ts', targetHash: hashOf(COMPILED) }],
        }),
      },
      { prefix: 'rdy-compile-drift-' },
    );
    using _cwd = pointCwdAt(tree.dir);

    const { stdout } = await compile([]);

    expect(stdout).not.toContain('skipped due to drift');
  });
});
