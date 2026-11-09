import { createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCompileConfig = vi.hoisted(() => vi.fn<(inputPath: string, outputPath?: string) => Promise<CompileResult>>());

// The bundler and the import of its output are mocked; configs, manifests, the drift gate, and deletion use the tree.
vi.mock(import('../compileConfig.ts'), () => ({
  compileConfig: mockCompileConfig,
}));

import { richFormatter } from '../../layout/formatter.ts';
import { CompileOutputSchema } from '../../schemas/compileOutputSchema.ts';
import type { CompileResult } from '../compileConfig.ts';
import { buildCompileResult, COMPILED, hashOf } from '../test-utils/compile-result-fixtures.ts';
import { compile, compileForPayload } from '../test-utils/compile-runners.ts';
import { readTreeManifest } from '../test-utils/readTreeManifest.ts';

const ICON_PASSED = richFormatter.tokens.passed.text;
const ICON_DRIFT = richFormatter.tokens.failedWarn.text;

/** A project containing one kit with a source and one whose source was deleted after both were compiled. */
const PROJECT_TREE = {
  '.readyup/kits/deploy.ts': COMPILED,
  '.readyup/kits/legacy.js': COMPILED,
  '.readyup/manifest.json': JSON.stringify({
    version: 1,
    kits: [
      { name: 'deploy', path: 'kits/deploy.js', source: 'kits/deploy.ts' },
      { name: 'legacy', path: 'kits/legacy.js', source: 'kits/legacy.ts', targetHash: hashOf(COMPILED) },
    ],
  }),
};

describe('compile handling bundles that no source compiles to', () => {
  beforeEach(() => {
    mockCompileConfig.mockImplementation(buildCompileResult);
  });

  afterEach(() => {
    mockCompileConfig.mockReset();
  });

  describe('a batch compile', () => {
    it('deletes the bundle of a kit whose source is gone, drops its entry, and reports the removal', async () => {
      using tree = createTempTree(PROJECT_TREE, { prefix: 'rdy-compile-prune-' });
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stdout } = await compile([]);

      expect(exitCode).toBe(0);
      expect(tree.exists('.readyup/kits/legacy.js')).toBe(false);
      expect(readTreeManifest(tree).kits.map((kit) => kit.name)).toStrictEqual(['deploy']);
      expect(stdout).toContain(`${ICON_PASSED} legacy.js · removed, no source compiles to it\n`);
    });

    it('lists the removal under --json without counting it against the run', async () => {
      using tree = createTempTree(PROJECT_TREE, { prefix: 'rdy-compile-prune-' });
      using _cwd = pointCwdAt(tree.dir);

      const payload = CompileOutputSchema.parse(await compileForPayload([]));

      expect(payload).toStrictEqual({
        schemaVersion: 1,
        passed: true,
        kits: [{ name: 'deploy', status: 'compiled' }],
        removed: [{ name: 'legacy', path: '.readyup/kits/legacy.js' }],
      });
    });

    it('keeps an edited orphan and its entry, and fails the run', async () => {
      using tree = createTempTree(PROJECT_TREE, { prefix: 'rdy-compile-prune-' });
      using _cwd = pointCwdAt(tree.dir);
      tree.write('.readyup/kits/legacy.js', 'export default { edited: true };');

      const { exitCode, stdout } = await compile([]);

      expect(exitCode).toBe(1);
      expect(tree.exists('.readyup/kits/legacy.js')).toBe(true);
      expect(readTreeManifest(tree).kits.map((kit) => kit.name)).toStrictEqual(['deploy', 'legacy']);
      expect(stdout).toContain(
        `${ICON_DRIFT} legacy.js\n   drift in legacy.js: expected ${hashOf(COMPILED)}, got ${hashOf('export default { edited: true };')}; no source compiles to it\n`,
      );
      expect(stdout).toContain(
        '1 of 2 kits skipped due to drift. Re-run with --force to remove, or restore the source.\n',
      );
    });

    it('reports an edited orphan as skipped under --json', async () => {
      using tree = createTempTree(PROJECT_TREE, { prefix: 'rdy-compile-prune-' });
      using _cwd = pointCwdAt(tree.dir);
      tree.write('.readyup/kits/legacy.js', 'export default { edited: true };');

      const payload = CompileOutputSchema.parse(await compileForPayload([]));

      expect(payload.passed).toBe(false);
      expect(payload.removed).toBeUndefined();
      expect(payload.kits).toContainEqual({
        name: 'legacy',
        status: 'skipped',
        error: expect.stringMatching(/^Compiled output has drifted from the manifest .+; no source compiles to it$/),
      });
    });

    it('names both remedies when an orphan and a kit with a source have both drifted', async () => {
      using tree = createTempTree(
        {
          ...PROJECT_TREE,
          '.readyup/kits/deploy.js': 'export default { edited: true };',
          '.readyup/manifest.json': JSON.stringify({
            version: 1,
            kits: [
              { name: 'deploy', path: 'kits/deploy.js', source: 'kits/deploy.ts', targetHash: hashOf(COMPILED) },
              { name: 'legacy', path: 'kits/legacy.js', source: 'kits/legacy.ts', targetHash: hashOf(COMPILED) },
            ],
          }),
        },
        { prefix: 'rdy-compile-prune-' },
      );
      using _cwd = pointCwdAt(tree.dir);
      tree.write('.readyup/kits/legacy.js', 'export default { edited: true };');

      const { stdout } = await compile([]);

      expect(stdout).toContain(
        '2 of 2 kits skipped due to drift. Re-run with --force to overwrite or remove, or move edits into the source.\n',
      );
    });

    it('deletes an edited orphan under --force', async () => {
      using tree = createTempTree(PROJECT_TREE, { prefix: 'rdy-compile-prune-' });
      using _cwd = pointCwdAt(tree.dir);
      tree.write('.readyup/kits/legacy.js', 'export default { edited: true };');

      const { exitCode } = await compile(['--force']);

      expect(exitCode).toBe(0);
      expect(tree.exists('.readyup/kits/legacy.js')).toBe(false);
      expect(readTreeManifest(tree).kits.map((kit) => kit.name)).toStrictEqual(['deploy']);
    });

    it('keeps an orphan whose bundle cannot be deleted, and fails the run', async () => {
      using tree = createTempTree(
        { ...withoutEntry(PROJECT_TREE, '.readyup/kits/legacy.js'), '.readyup/kits/legacy.js/': '' },
        { prefix: 'rdy-compile-prune-' },
      );
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stdout, stderr } = await compile([]);

      expect(exitCode).toBe(1);
      expect(readTreeManifest(tree).kits.map((kit) => kit.name)).toStrictEqual(['deploy', 'legacy']);
      expect(stderr).toMatch(/^rdy: cannot remove \.readyup\/kits\/legacy\.js: .+$/m);
      expect(stdout).toContain('1 of 2 kits could not be removed.\n');
    });

    it('prunes in a sweep that finds no sources, and says what the manifest now lists', async () => {
      using tree = createTempTree(withoutEntry(PROJECT_TREE, '.readyup/kits/deploy.ts'), {
        prefix: 'rdy-compile-prune-',
      });
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stdout } = await compile([]);

      expect(exitCode).toBe(0);
      expect(tree.exists('.readyup/kits/legacy.js')).toBe(false);
      expect(readTreeManifest(tree).kits.map((kit) => kit.name)).toStrictEqual([]);
      expect(stdout).toBe(
        `No .ts files found in .readyup/kits; manifest now lists no kits\n${ICON_PASSED} legacy.js · removed, no source compiles to it\n`,
      );
    });

    it('counts a kept orphan in the manifest of a sweep that finds no sources', async () => {
      using tree = createTempTree(withoutEntry(PROJECT_TREE, '.readyup/kits/deploy.ts'), {
        prefix: 'rdy-compile-prune-',
      });
      using _cwd = pointCwdAt(tree.dir);
      tree.write('.readyup/kits/legacy.js', 'export default { edited: true };');

      const { exitCode, stdout } = await compile([]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain('No .ts files found in .readyup/kits; manifest now lists 1 kit\n');
      expect(stdout).toContain('1 of 1 kit skipped due to drift.');
    });

    it('deletes nothing and warns on nothing under --skip-manifest', async () => {
      using tree = createTempTree(PROJECT_TREE, { prefix: 'rdy-compile-prune-' });
      using _cwd = pointCwdAt(tree.dir);

      const { stderr } = await compile(['--skip-manifest']);

      expect(tree.exists('.readyup/kits/legacy.js')).toBe(true);
      expect(stderr).not.toContain('Warning:');
    });

    it('warns on a bundle that the manifest does not record, keeps it, and passes', async () => {
      using tree = createTempTree(
        { ...PROJECT_TREE, '.readyup/kits/old.js': COMPILED },
        { prefix: 'rdy-compile-prune-' },
      );
      using _cwd = pointCwdAt(tree.dir);

      const payload = CompileOutputSchema.parse(await compileForPayload([]));

      expect(tree.exists('.readyup/kits/old.js')).toBe(true);
      expect(payload.passed).toBe(true);
      expect(payload.warnings).toStrictEqual([
        {
          code: 'bundle-unrecorded',
          message: 'old.js in .readyup/kits is not recorded in the manifest, and no source compiles to it.',
          remedy: 'Delete it if its kit was removed.',
        },
      ]);
    });

    it('raises no warning for an edited orphan, whose entry the manifest keeps', async () => {
      using tree = createTempTree(PROJECT_TREE, { prefix: 'rdy-compile-prune-' });
      using _cwd = pointCwdAt(tree.dir);
      tree.write('.readyup/kits/legacy.js', 'export default { edited: true };');

      const { stderr } = await compile([]);

      expect(stderr).not.toContain('Warning:');
    });

    it('keeps the bundle that the sweep wrote, whatever name the prior manifest gave it', async () => {
      using tree = createTempTree(
        {
          '.readyup/kits/ops/deploy.js': COMPILED,
          '.readyup/kits/ops/deploy.ts': COMPILED,
          '.readyup/manifest.json': JSON.stringify({
            version: 1,
            kits: [
              {
                name: 'deploy',
                path: 'kits/ops/deploy.js',
                source: 'kits/ops/deploy.ts',
                targetHash: hashOf(COMPILED),
              },
            ],
          }),
        },
        { prefix: 'rdy-compile-prune-' },
      );
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stdout } = await compile([]);

      expect(exitCode).toBe(0);
      expect(tree.exists('.readyup/kits/ops/deploy.js')).toBe(true);
      expect(readTreeManifest(tree).kits.map((kit) => kit.name)).toStrictEqual(['ops/deploy']);
      expect(stdout).not.toContain('removed');
    });
  });

  describe('a single-file compile', () => {
    it('deletes nothing, warns on nothing, and leaves the entries of other kits', async () => {
      using tree = createTempTree(PROJECT_TREE, { prefix: 'rdy-compile-prune-' });
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stderr } = await compile(['.readyup/kits/deploy.ts']);

      expect(exitCode).toBe(0);
      expect(stderr).not.toContain('Warning:');
      expect(tree.exists('.readyup/kits/legacy.js')).toBe(true);
      expect(readTreeManifest(tree).kits.map((kit) => kit.name)).toStrictEqual(['deploy', 'legacy']);
    });
  });

  describe('a recursive compile', () => {
    it('names the project of each removal, and its path against the sweep root', async () => {
      using tree = createTempTree(
        {
          'package.json': JSON.stringify({ name: 'root' }),
          'packages/api/package.json': JSON.stringify({ name: 'api' }),
          ...prefixEntries('packages/api/', PROJECT_TREE),
        },
        { prefix: 'rdy-compile-prune-' },
      );
      using _cwd = pointCwdAt(tree.dir);

      const payload = CompileOutputSchema.parse(await compileForPayload(['--recursive']));

      expect(payload.removed).toStrictEqual([
        { name: 'legacy', project: 'packages/api', path: 'packages/api/.readyup/kits/legacy.js' },
      ]);
      expect(tree.exists('packages/api/.readyup/kits/legacy.js')).toBe(false);
    });
  });
});

// region | Helpers

/** Returns the entries of a tree with each key placed below `prefix`. */
function prefixEntries(prefix: string, entries: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(entries).map(([key, value]) => [`${prefix}${key}`, value]));
}

/** Returns the entries of a tree without the one at `key`. */
function withoutEntry(entries: Record<string, string>, key: string): Record<string, string> {
  return Object.fromEntries(Object.entries(entries).filter(([entryKey]) => entryKey !== key));
}

// endregion | Helpers
