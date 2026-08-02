import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { discoverWorkspaces } from '../../src/check-utils/workspaces.ts';
import { useTempDir } from '../helpers/tempDir.ts';

const temp = useTempDir({ prefix: 'rdy-ws-', cwd: 'mock' });

describe(discoverWorkspaces, () => {
  describe('pnpm workspaces', () => {
    it('discovers workspaces listed via `packages` block sequence', () => {
      writeRootPackageJson({ name: 'root', private: true });
      writePnpmWorkspaceYaml(['packages:', '  - packages/*', '  - apps/**', ''].join('\n'));
      writeWorkspacePackage('packages/alpha', { name: 'alpha', version: '1.0.0' });
      writeWorkspacePackage('packages/beta', { name: 'beta', version: '1.0.0' });
      writeWorkspacePackage('apps/web', { name: 'web', version: '1.0.0' });

      const workspaces = discoverWorkspaces();

      expect(workspaces.map((w) => w.dir)).toStrictEqual(['apps/web', 'packages/alpha', 'packages/beta']);
      expect(workspaces.map((w) => w.name)).toStrictEqual(['web', 'alpha', 'beta']);
    });

    it('returns an empty array when a pattern expands to zero directories', () => {
      writeRootPackageJson({ name: 'root', private: true });
      writePnpmWorkspaceYaml(['packages:', '  - packages/*', ''].join('\n'));

      expect(discoverWorkspaces()).toStrictEqual([]);
    });

    it('falls through to npm/single detection when `packages` key is absent', () => {
      writeRootPackageJson({ name: 'root', version: '1.0.0' });
      writePnpmWorkspaceYaml(['onlyBuiltDependencies:', '  - esbuild', ''].join('\n'));

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

    it('propagates errors from the YAML reader for unsupported features', () => {
      writeRootPackageJson({ name: 'root', private: true });
      writePnpmWorkspaceYaml(['packages:', '  - &anchor packages/*', ''].join('\n'));

      expect(() => discoverWorkspaces()).toThrow(/anchor/);
    });
  });

  describe('npm/yarn workspaces', () => {
    it('discovers workspaces when `workspaces` is a string array', () => {
      writeRootPackageJson({ name: 'root', private: true, workspaces: ['packages/*'] });
      writeWorkspacePackage('packages/alpha', { name: 'alpha' });
      writeWorkspacePackage('packages/beta', { name: 'beta' });

      const workspaces = discoverWorkspaces();

      expect(workspaces.map((w) => w.dir)).toStrictEqual(['packages/alpha', 'packages/beta']);
    });

    it('discovers workspaces when `workspaces.packages` is a string array', () => {
      writeRootPackageJson({
        name: 'root',
        private: true,
        workspaces: { packages: ['packages/*', 'apps/*'] },
      });
      writeWorkspacePackage('packages/alpha', { name: 'alpha' });
      writeWorkspacePackage('apps/web', { name: 'web' });

      const workspaces = discoverWorkspaces();

      expect(workspaces.map((w) => w.dir)).toStrictEqual(['apps/web', 'packages/alpha']);
    });

    it('returns isPackage: false for a discovered workspace with `private: true`', () => {
      writeRootPackageJson({ name: 'root', private: true, workspaces: ['packages/*'] });
      writeWorkspacePackage('packages/alpha', { name: 'alpha' });
      writeWorkspacePackage('packages/internal', { name: 'internal', private: true });

      const workspaces = discoverWorkspaces();
      const byDir = Object.fromEntries(workspaces.map((w) => [w.dir, w.isPackage]));

      expect(byDir).toStrictEqual({ 'packages/alpha': true, 'packages/internal': false });
    });
  });

  describe('single-workspace repo', () => {
    it('returns a single entry with dir: "." when no workspace config is present', () => {
      writeRootPackageJson({ name: 'solo', version: '1.0.0' });

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

    it('returns isPackage: false when `private: true`', () => {
      writeRootPackageJson({ name: 'solo', private: true });

      expect(discoverWorkspaces()[0]?.isPackage).toBe(false);
    });

    it('returns isPackage: true when `private` is absent', () => {
      writeRootPackageJson({ name: 'solo' });

      expect(discoverWorkspaces()[0]?.isPackage).toBe(true);
    });

    it('returns isPackage: true when `private: false`', () => {
      writeRootPackageJson({ name: 'solo', private: false });

      expect(discoverWorkspaces()[0]?.isPackage).toBe(true);
    });

    it('returns isPackage: true when `private` is a non-true value like the string "false"', () => {
      writeRootPackageJson({ name: 'solo', private: 'false' });

      expect(discoverWorkspaces()[0]?.isPackage).toBe(true);
    });

    it('returns `name: undefined` when root package.json has no `name` field', () => {
      writeRootPackageJson({ version: '1.0.0' });

      expect(discoverWorkspaces()[0]?.name).toBeUndefined();
    });
  });

  describe('filter option', () => {
    it('excludes workspaces for which the filter returns false', () => {
      writeRootPackageJson({ name: 'root', private: true, workspaces: ['packages/*'] });
      writeWorkspacePackage('packages/alpha', { name: 'alpha' });
      writeWorkspacePackage('packages/beta', { name: 'beta', private: true });

      const workspaces = discoverWorkspaces({ filter: (w) => w.isPackage });

      expect(workspaces.map((w) => w.name)).toStrictEqual(['alpha']);
    });
  });

  describe('skipping non-workspace matched directories', () => {
    it('skips a matched directory without a package.json', () => {
      writeRootPackageJson({ name: 'root', private: true, workspaces: ['packages/*'] });
      writeWorkspacePackage('packages/alpha', { name: 'alpha' });
      temp.mkdir('packages/empty');

      const workspaces = discoverWorkspaces();

      expect(workspaces.map((w) => w.dir)).toStrictEqual(['packages/alpha']);
    });

    it('skips a matched directory with an unparseable package.json', () => {
      writeRootPackageJson({ name: 'root', private: true, workspaces: ['packages/*'] });
      writeWorkspacePackage('packages/alpha', { name: 'alpha' });
      temp.write('packages/broken/package.json', '{ not valid json');

      const workspaces = discoverWorkspaces();

      expect(workspaces.map((w) => w.dir)).toStrictEqual(['packages/alpha']);
    });

    it('does not traverse into node_modules', () => {
      writeRootPackageJson({ name: 'root', private: true, workspaces: ['**/*'] });
      writeWorkspacePackage('packages/alpha', { name: 'alpha' });
      // A fake workspace hiding inside node_modules — must not appear in results.
      writeWorkspacePackage('node_modules/sneaky', { name: 'sneaky' });

      const workspaces = discoverWorkspaces();

      expect(workspaces.map((w) => w.name)).not.toContain('sneaky');
    });

    it('does not traverse into .git', () => {
      writeRootPackageJson({ name: 'root', private: true, workspaces: ['**/*'] });
      writeWorkspacePackage('packages/alpha', { name: 'alpha' });
      writeWorkspacePackage('.git/fake', { name: 'fake' });

      const workspaces = discoverWorkspaces();

      expect(workspaces.map((w) => w.name)).not.toContain('fake');
    });
  });

  describe('error: missing root package.json', () => {
    it('throws with a message that includes the resolved path', () => {
      expect(() => discoverWorkspaces()).toThrow(/no package\.json found at/);
      expect(() => discoverWorkspaces()).toThrow(temp.dir);
    });

    it('throws even when pnpm-workspace.yaml is present', () => {
      writePnpmWorkspaceYaml(['packages:', '  - packages/*', ''].join('\n'));

      expect(() => discoverWorkspaces()).toThrow(/no package\.json found at/);
    });
  });

  describe('sorting', () => {
    it('sorts results by dir ascending', () => {
      writeRootPackageJson({ name: 'root', private: true, workspaces: ['packages/*'] });
      writeWorkspacePackage('packages/zeta', { name: 'zeta' });
      writeWorkspacePackage('packages/alpha', { name: 'alpha' });
      writeWorkspacePackage('packages/mu', { name: 'mu' });

      const workspaces = discoverWorkspaces();

      expect(workspaces.map((w) => w.dir)).toStrictEqual(['packages/alpha', 'packages/mu', 'packages/zeta']);
    });
  });

  describe('Workspace shape', () => {
    it('includes absolutePath, name, isPackage, and packageJson for a monorepo workspace', () => {
      writeRootPackageJson({ name: 'root', private: true, workspaces: ['packages/*'] });
      writeWorkspacePackage('packages/alpha', { name: 'alpha', version: '1.2.3' });

      const [workspace] = discoverWorkspaces();

      expect(workspace).toStrictEqual({
        dir: 'packages/alpha',
        absolutePath: join(temp.dir, 'packages/alpha'),
        name: 'alpha',
        isPackage: true,
        packageJson: { name: 'alpha', version: '1.2.3' },
      });
    });
  });

  describe('negation patterns in npm workspaces', () => {
    it('throws when `workspaces` contains a negation pattern', () => {
      writeRootPackageJson({
        name: 'root',
        private: true,
        workspaces: ['packages/*', '!packages/deprecated/*'],
      });

      expect(() => discoverWorkspaces()).toThrow(/negation pattern "!packages\/deprecated\/\*"/);
    });

    it('throws when `workspaces.packages` contains a negation pattern', () => {
      writeRootPackageJson({
        name: 'root',
        private: true,
        workspaces: { packages: ['packages/*', '!packages/deprecated/*'] },
      });

      expect(() => discoverWorkspaces()).toThrow(/negation pattern "!packages\/deprecated\/\*"/);
    });
  });
});

// region | Helpers

/** Writes the root manifest that declares the workspace globs. */
function writeRootPackageJson(content: Record<string, unknown>): void {
  temp.writeJson('package.json', content);
}

/** Writes a workspace member's manifest at a root-relative directory. */
function writeWorkspacePackage(relDir: string, content: Record<string, unknown>): void {
  temp.writeJson(join(relDir, 'package.json'), content);
}

/** Writes the pnpm workspace manifest, which takes precedence over the `workspaces` field. */
function writePnpmWorkspaceYaml(content: string): void {
  temp.write('pnpm-workspace.yaml', content);
}

// endregion | Helpers
