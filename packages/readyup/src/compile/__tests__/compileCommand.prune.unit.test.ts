import { realpathSync } from 'node:fs';
import path from 'node:path';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { captureStdio, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCompileConfig = vi.hoisted(() => vi.fn<(inputPath: string, outputPath?: string) => Promise<CompileResult>>());
const mockValidateCompiledOutput = vi.hoisted(() => vi.fn());

// The bundler and the import of its output are mocked; configs, manifests, the drift gate, and deletion use the tree.
vi.mock(import('../compileConfig.ts'), () => ({
  compileConfig: mockCompileConfig,
}));

vi.mock(import('../validateCompiledOutput.ts'), () => ({
  validateCompiledOutput: mockValidateCompiledOutput,
}));

import { richFormatter } from '../../layout/richFormatter.ts';
import { ManifestSchema } from '../../manifest/manifestSchema.ts';
import { CompileOutputSchema } from '../../schemas/compileOutputSchema.ts';
import { hashBytes } from '../../verify/targetHash.ts';
import { compileCommand } from '../compileCommand.ts';
import type { CompileResult } from '../compileConfig.ts';

const ICON_PASSED = richFormatter.tokens.passed.glyph;
const ICON_DRIFT = richFormatter.tokens.failedWarn.glyph;

/** Bundle contents as the compile wrote them. */
const COMPILED = 'export default {};';

/** A project holding one kit with a source and one whose source was deleted after both were compiled. */
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
    mockCompileConfig.mockImplementation(compileResult);
    mockValidateCompiledOutput.mockResolvedValue({ checklists: [] });
  });

  afterEach(() => {
    mockCompileConfig.mockReset();
    mockValidateCompiledOutput.mockReset();
  });

  describe('a batch compile', () => {
    it('deletes the bundle of a kit whose source is gone, drops its entry, and reports the removal', async () => {
      using tree = createTempTree(PROJECT_TREE, { prefix: 'rdy-compile-prune-' });
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stdout } = await compile([]);

      expect(exitCode).toBe(0);
      expect(tree.exists('.readyup/kits/legacy.js')).toBe(false);
      expect(manifestKitNames(tree)).toStrictEqual(['deploy']);
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
      expect(manifestKitNames(tree)).toStrictEqual(['deploy', 'legacy']);
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
      expect(manifestKitNames(tree)).toStrictEqual(['deploy']);
    });

    it('keeps an orphan whose bundle cannot be deleted, and fails the run', async () => {
      using tree = createTempTree(
        { ...withoutEntry(PROJECT_TREE, '.readyup/kits/legacy.js'), '.readyup/kits/legacy.js/': '' },
        { prefix: 'rdy-compile-prune-' },
      );
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stdout, stderr } = await compile([]);

      expect(exitCode).toBe(1);
      expect(manifestKitNames(tree)).toStrictEqual(['deploy', 'legacy']);
      expect(stderr).toMatch(/^Error removing \.readyup\/kits\/legacy\.js: .+$/m);
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
      expect(manifestKitNames(tree)).toStrictEqual([]);
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

    it('keeps the bundle and single entry of a recorded kit whose name two sources now share', async () => {
      using tree = createTempTree(
        {
          '.readyup/kits/deploy.js': COMPILED,
          '.readyup/kits/deploy.ts': COMPILED,
          '.readyup/kits/ops/deploy.ts': COMPILED,
          '.readyup/manifest.json': JSON.stringify({
            version: 1,
            kits: [{ name: 'deploy', path: 'kits/deploy.js', source: 'kits/deploy.ts', targetHash: hashOf(COMPILED) }],
          }),
        },
        { prefix: 'rdy-compile-prune-' },
      );
      using _cwd = pointCwdAt(tree.dir);

      const payload = CompileOutputSchema.parse(await compileForPayload([]));

      const sharedNameFailure = {
        name: 'deploy',
        status: 'failed',
        error: expect.stringContaining('Kit name "deploy" is shared by deploy.ts and ops/deploy.ts.'),
      };
      expect(payload).toStrictEqual({ schemaVersion: 1, passed: false, kits: [sharedNameFailure, sharedNameFailure] });
      expect(tree.exists('.readyup/kits/deploy.js')).toBe(true);
      expect(manifestKitNames(tree)).toStrictEqual(['deploy']);
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
      expect(manifestKitNames(tree)).toStrictEqual(['deploy', 'legacy']);
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

/** Runs the command over the given arguments, returning its exit code alongside everything it wrote. */
async function compile(args: string[]) {
  using io = captureStdio();

  const exitCode = await compileCommand(args);

  return { exitCode, stdout: io.stdout, stderr: io.stderr };
}

/** Runs a compile under `--json` and returns the payload that it emitted. */
async function compileForPayload(args: string[]): Promise<unknown> {
  const { stdout } = await compile([...args, '--json']);
  return JSON.parse(stdout);
}

/** Returns a successful compile result for a source, recording the source as its only input. */
function compileResult(inputPath: string, outputPath = inputPath.replace(/\.ts$/, '.js')): Promise<CompileResult> {
  return Promise.resolve({
    bundledDependencies: {},
    changed: true,
    esbuildVersion: '0.99.0-test',
    inlinedJson: [],
    inputs: [{ hash: '5c0e1234', kind: 'module', path: realpathSync(inputPath) }],
    outputPath: path.resolve(outputPath),
    targetHash: hashOf(COMPILED),
  });
}

/** Returns the hash that the manifest records for a bundle with these contents. */
function hashOf(contents: string): string {
  return hashBytes(Buffer.from(contents, 'utf8'));
}

/** Returns the names of the kits recorded by the tree's manifest, in the order that it lists them. */
function manifestKitNames(tree: TempTree): string[] {
  const manifest = ManifestSchema.parse(tree.readJson('.readyup/manifest.json'));
  return manifest.kits.map((kit) => kit.name);
}

/** Returns the entries of a tree with each key placed below `prefix`. */
function prefixEntries(prefix: string, entries: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(entries).map(([key, value]) => [`${prefix}${key}`, value]));
}

/** Returns the entries of a tree without the one at `key`. */
function withoutEntry(entries: Record<string, string>, key: string): Record<string, string> {
  return Object.fromEntries(Object.entries(entries).filter(([entryKey]) => entryKey !== key));
}

// endregion | Helpers
