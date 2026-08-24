import { join } from 'node:path';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test } from 'vitest';

import { discoverWorkspaces, discoverWorkspacesAt } from '../workspaces.ts';

const it = test.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-ws-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

describe(discoverWorkspaces, () => {
  describe('pnpm workspaces', () => {
    it('discovers workspaces listed via `packages` block sequence', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'root', private: true });
      writePnpmWorkspaceYaml(temp, ['packages:', '  - packages/*', '  - apps/**', ''].join('\n'));
      writeWorkspacePackage(temp, 'packages/alpha', { name: 'alpha', version: '1.0.0' });
      writeWorkspacePackage(temp, 'packages/beta', { name: 'beta', version: '1.0.0' });
      writeWorkspacePackage(temp, 'apps/web', { name: 'web', version: '1.0.0' });

      const workspaces = discoverWorkspaces();

      expect(workspaces.map((w) => w.dir)).toStrictEqual(['apps/web', 'packages/alpha', 'packages/beta']);
      expect(workspaces.map((w) => w.name)).toStrictEqual(['web', 'alpha', 'beta']);
    });

    it('returns an empty array when a pattern expands to zero directories', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'root', private: true });
      writePnpmWorkspaceYaml(temp, ['packages:', '  - packages/*', ''].join('\n'));

      expect(discoverWorkspaces()).toStrictEqual([]);
    });

    it('falls through to npm/single detection when `packages` key is absent', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'root', version: '1.0.0' });
      writePnpmWorkspaceYaml(temp, ['onlyBuiltDependencies:', '  - esbuild', ''].join('\n'));

      const workspaces = discoverWorkspaces();

      expect(workspaces).toStrictEqual([
        {
          dir: '.',
          absolutePath: temp.dir,
          name: 'root',
          isPackage: true,
          packageJson: { name: 'root', version: '1.0.0' },
        },
      ]);
    });

    it('propagates errors from the YAML reader for unsupported features', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'root', private: true });
      writePnpmWorkspaceYaml(temp, ['packages:', '  - &anchor packages/*', ''].join('\n'));

      expect(() => discoverWorkspaces()).toThrow(/anchor/);
    });
  });

  describe('npm/yarn workspaces', () => {
    it('discovers workspaces when `workspaces` is a string array', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'root', private: true, workspaces: ['packages/*'] });
      writeWorkspacePackage(temp, 'packages/alpha', { name: 'alpha' });
      writeWorkspacePackage(temp, 'packages/beta', { name: 'beta' });

      const workspaces = discoverWorkspaces();

      expect(workspaces.map((w) => w.dir)).toStrictEqual(['packages/alpha', 'packages/beta']);
    });

    it('discovers workspaces when `workspaces.packages` is a string array', ({ temp }) => {
      writeRootPackageJson(temp, {
        name: 'root',
        private: true,
        workspaces: { packages: ['packages/*', 'apps/*'] },
      });
      writeWorkspacePackage(temp, 'packages/alpha', { name: 'alpha' });
      writeWorkspacePackage(temp, 'apps/web', { name: 'web' });

      const workspaces = discoverWorkspaces();

      expect(workspaces.map((w) => w.dir)).toStrictEqual(['apps/web', 'packages/alpha']);
    });

    it('returns isPackage: false for a discovered workspace with `private: true`', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'root', private: true, workspaces: ['packages/*'] });
      writeWorkspacePackage(temp, 'packages/alpha', { name: 'alpha' });
      writeWorkspacePackage(temp, 'packages/internal', { name: 'internal', private: true });

      const workspaces = discoverWorkspaces();
      const byDir = Object.fromEntries(workspaces.map((w) => [w.dir, w.isPackage]));

      expect(byDir).toStrictEqual({ 'packages/alpha': true, 'packages/internal': false });
    });
  });

  describe('single-workspace repo', () => {
    it('returns a single entry with dir: "." when no workspace config is present', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'solo', version: '1.0.0' });

      const workspaces = discoverWorkspaces();

      expect(workspaces).toStrictEqual([
        {
          dir: '.',
          absolutePath: temp.dir,
          name: 'solo',
          isPackage: true,
          packageJson: { name: 'solo', version: '1.0.0' },
        },
      ]);
    });

    it('returns isPackage: false when `private: true`', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'solo', private: true });

      expect(discoverWorkspaces()[0]?.isPackage).toBe(false);
    });

    it('returns isPackage: true when `private` is absent', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'solo' });

      expect(discoverWorkspaces()[0]?.isPackage).toBe(true);
    });

    it('returns isPackage: true when `private: false`', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'solo', private: false });

      expect(discoverWorkspaces()[0]?.isPackage).toBe(true);
    });

    it('returns isPackage: true when `private` is a non-true value like the string "false"', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'solo', private: 'false' });

      expect(discoverWorkspaces()[0]?.isPackage).toBe(true);
    });

    it('returns `name: undefined` when root package.json has no `name` field', ({ temp }) => {
      writeRootPackageJson(temp, { version: '1.0.0' });

      expect(discoverWorkspaces()[0]?.name).toBeUndefined();
    });
  });

  describe('filter option', () => {
    it('excludes workspaces for which the filter returns false', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'root', private: true, workspaces: ['packages/*'] });
      writeWorkspacePackage(temp, 'packages/alpha', { name: 'alpha' });
      writeWorkspacePackage(temp, 'packages/beta', { name: 'beta', private: true });

      const workspaces = discoverWorkspaces({ filter: (w) => w.isPackage });

      expect(workspaces.map((w) => w.name)).toStrictEqual(['alpha']);
    });
  });

  describe('skipping directories that are not workspaces', () => {
    it('skips a directory without a package.json', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'root', private: true, workspaces: ['packages/*'] });
      writeWorkspacePackage(temp, 'packages/alpha', { name: 'alpha' });
      temp.mkdir('packages/empty');

      const workspaces = discoverWorkspaces();

      expect(workspaces.map((w) => w.dir)).toStrictEqual(['packages/alpha']);
    });

    it('skips a matched directory with an unparseable package.json', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'root', private: true, workspaces: ['packages/*'] });
      writeWorkspacePackage(temp, 'packages/alpha', { name: 'alpha' });
      temp.write('packages/broken/package.json', '{ not valid json');

      const workspaces = discoverWorkspaces();

      expect(workspaces.map((w) => w.dir)).toStrictEqual(['packages/alpha']);
    });

    it('does not traverse into node_modules', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'root', private: true, workspaces: ['**/*'] });
      writeWorkspacePackage(temp, 'packages/alpha', { name: 'alpha' });
      // A fake workspace hiding inside node_modules — must not appear in results.
      writeWorkspacePackage(temp, 'node_modules/sneaky', { name: 'sneaky' });

      const workspaces = discoverWorkspaces();

      expect(workspaces.map((w) => w.name)).not.toContain('sneaky');
    });

    it('does not traverse into .git', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'root', private: true, workspaces: ['**/*'] });
      writeWorkspacePackage(temp, 'packages/alpha', { name: 'alpha' });
      writeWorkspacePackage(temp, '.git/fake', { name: 'fake' });

      const workspaces = discoverWorkspaces();

      expect(workspaces.map((w) => w.name)).not.toContain('fake');
    });
  });

  describe('pattern shapes', () => {
    it('does not report the repo root as a workspace under a `**` pattern', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'root', private: true, workspaces: ['**'] });
      writeWorkspacePackage(temp, 'packages/alpha', { name: 'alpha' });

      const workspaces = discoverWorkspaces();

      expect(workspaces.map((w) => w.dir)).toStrictEqual(['packages/alpha']);
    });

    it('resolves a trailing-slash pattern to the same set as its bare form', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'root', private: true, workspaces: ['packages/*/'] });
      writeWorkspacePackage(temp, 'packages/alpha', { name: 'alpha' });
      writeWorkspacePackage(temp, 'packages/beta', { name: 'beta' });

      const workspaces = discoverWorkspaces();

      expect(workspaces.map((w) => w.dir)).toStrictEqual(['packages/alpha', 'packages/beta']);
    });

    it('resolves a pattern that names its directory literally', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'root', private: true, workspaces: ['tools/formatter'] });
      writeWorkspacePackage(temp, 'tools/formatter', { name: 'formatter' });
      writeWorkspacePackage(temp, 'tools/linter', { name: 'linter' });

      const workspaces = discoverWorkspaces();

      expect(workspaces.map((w) => w.dir)).toStrictEqual(['tools/formatter']);
    });
  });

  describe('error: missing root package.json', () => {
    it('throws with a message that includes the resolved path', ({ temp }) => {
      expect(() => discoverWorkspaces()).toThrow(/no package\.json found at/);
      expect(() => discoverWorkspaces()).toThrow(temp.dir);
    });

    it('throws even when pnpm-workspace.yaml is present', ({ temp }) => {
      writePnpmWorkspaceYaml(temp, ['packages:', '  - packages/*', ''].join('\n'));

      expect(() => discoverWorkspaces()).toThrow(/no package\.json found at/);
    });
  });

  describe('sorting', () => {
    it('sorts results by dir ascending', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'root', private: true, workspaces: ['packages/*'] });
      writeWorkspacePackage(temp, 'packages/zeta', { name: 'zeta' });
      writeWorkspacePackage(temp, 'packages/alpha', { name: 'alpha' });
      writeWorkspacePackage(temp, 'packages/mu', { name: 'mu' });

      const workspaces = discoverWorkspaces();

      expect(workspaces.map((w) => w.dir)).toStrictEqual(['packages/alpha', 'packages/mu', 'packages/zeta']);
    });
  });

  describe('Workspace shape', () => {
    it('includes absolutePath, name, isPackage, and packageJson for a monorepo workspace', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'root', private: true, workspaces: ['packages/*'] });
      writeWorkspacePackage(temp, 'packages/alpha', { name: 'alpha', version: '1.2.3' });

      const [workspace] = discoverWorkspaces();

      expect(workspace).toStrictEqual({
        dir: 'packages/alpha',
        absolutePath: join(temp.dir, 'packages/alpha'),
        name: 'alpha',
        isPackage: true,
        packageJson: { name: 'alpha', version: '1.2.3' },
      });
    });

    it('freezes the workspace and its `packageJson`', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'root', version: '1.0.0' });

      const [workspace] = discoverWorkspaces();

      // `Object.isFrozen` answers true for `undefined`, so each subject is pinned before it is tested.
      expect(workspace).toBeDefined();
      expect(Object.isFrozen(workspace)).toBe(true);
      expect(Object.isFrozen(workspace?.packageJson)).toBe(true);
    });

    it('freezes values nested inside `packageJson`, where an in-place sort would otherwise land', ({ temp }) => {
      writeRootPackageJson(temp, { name: 'root', files: ['dist', 'bin'], scripts: { build: 'tsc' } });

      const [workspace] = discoverWorkspaces();

      expect(workspace?.packageJson['files']).toStrictEqual(['dist', 'bin']);
      expect(Object.isFrozen(workspace?.packageJson['files'])).toBe(true);
      expect(workspace?.packageJson['scripts']).toStrictEqual({ build: 'tsc' });
      expect(Object.isFrozen(workspace?.packageJson['scripts'])).toBe(true);
    });
  });

  describe('negation patterns in npm workspaces', () => {
    it('throws when `workspaces` contains a negation pattern', ({ temp }) => {
      writeRootPackageJson(temp, {
        name: 'root',
        private: true,
        workspaces: ['packages/*', '!packages/deprecated/*'],
      });

      expect(() => discoverWorkspaces()).toThrow(/negation pattern "!packages\/deprecated\/\*"/);
    });

    it('throws when `workspaces.packages` contains a negation pattern', ({ temp }) => {
      writeRootPackageJson(temp, {
        name: 'root',
        private: true,
        workspaces: { packages: ['packages/*', '!packages/deprecated/*'] },
      });

      expect(() => discoverWorkspaces()).toThrow(/negation pattern "!packages\/deprecated\/\*"/);
    });
  });
});

describe(discoverWorkspacesAt, () => {
  it('reads the repo at the directory it is handed rather than the ambient cwd', ({ temp }) => {
    writeWorkspacePackage(temp, 'nested', { name: 'nested-root', private: true, workspaces: ['packages/*'] });
    writeWorkspacePackage(temp, 'nested/packages/alpha', { name: 'alpha' });

    const workspaces = discoverWorkspacesAt(temp.resolve('nested'));

    expect(workspaces.map((w) => w.name)).toStrictEqual(['alpha']);
    // The ambient cwd holds no manifest, so an answer read through it could not be this one.
    expect(() => discoverWorkspaces()).toThrow(/no package.json found/);
  });

  it('resolves a relative directory against the cwd', ({ temp }) => {
    writeWorkspacePackage(temp, 'nested', { name: 'nested-root', private: true, workspaces: ['packages/*'] });
    writeWorkspacePackage(temp, 'nested/packages/beta', { name: 'beta' });

    expect(discoverWorkspacesAt('nested').map((w) => w.absolutePath)).toStrictEqual([
      temp.resolve('nested/packages/beta'),
    ]);
  });
});

// region | Helpers

/** Writes the root manifest that declares the workspace globs. */
function writeRootPackageJson(temp: TempTree, content: Record<string, unknown>): void {
  temp.writeJson('package.json', content);
}

/** Writes a package manifest at a root-relative directory. */
function writeWorkspacePackage(temp: TempTree, relDir: string, content: Record<string, unknown>): void {
  temp.writeJson(join(relDir, 'package.json'), content);
}

/** Writes the pnpm workspace manifest, which takes precedence over the `workspaces` field. */
function writePnpmWorkspaceYaml(temp: TempTree, content: string): void {
  temp.write('pnpm-workspace.yaml', content);
}

// endregion | Helpers
