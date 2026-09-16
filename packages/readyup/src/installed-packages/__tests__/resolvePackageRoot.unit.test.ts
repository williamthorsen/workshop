import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { resolvePackageRoot } from '../resolvePackageRoot.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  { scope: 'file' },
  makeFixture(() =>
    createTempTree(
      {
        'node_modules/@acme/kitpkg/package.json': '{"name":"@acme/kitpkg","version":"1.0.0"}\n',
        // A directory that occupies the name but has no manifest, which is not a package.
        'node_modules/readyup-fixture-manifestless/': '',
        'packages/nested/': '',
      },
      { prefix: 'resolve-package-root-' },
    ),
  ),
);

describe(resolvePackageRoot, () => {
  describe('against the repo in which it runs', () => {
    it('resolves an unscoped dependency to a directory holding its manifest', () => {
      const root = resolvePackageRoot('zod', REPO_ROOT);

      expect(root).toBeDefined();
      expect(path.basename(root ?? '')).toBe('zod');
    });

    // The leading `@` of a scope must not be mistaken for a path or version delimiter.
    it('resolves a scoped dependency', () => {
      const root = resolvePackageRoot('@williamthorsen/nmr', REPO_ROOT);

      expect(root).toBeDefined();
      expect(root).toContain(path.join('@williamthorsen', 'nmr'));
    });

    // `readyup` publishes only `import` and `types` conditions, so a require-based resolver fails on it.
    // Resolving to the workspace checkout is also what makes the walk usable inside this monorepo.
    it('resolves an ESM-only workspace package to its source checkout', () => {
      const root = resolvePackageRoot('readyup', REPO_ROOT);

      expect(root).toBe(path.join(REPO_ROOT, 'packages', 'readyup'));
    });

    it('returns undefined for a package that is not installed', () => {
      expect(resolvePackageRoot('readyup-package-that-does-not-exist', REPO_ROOT)).toBeUndefined();
    });
  });

  describe('against a fixture project', () => {
    it('finds a package installed in an ancestor directory', ({ temp }) => {
      expect(resolvePackageRoot('@acme/kitpkg', temp.resolve('packages/nested'))).toBe(
        temp.resolve('node_modules/@acme/kitpkg'),
      );
    });

    it('ignores a node_modules entry with no manifest', ({ temp }) => {
      expect(resolvePackageRoot('readyup-fixture-manifestless', temp.resolve('packages/nested'))).toBeUndefined();
    });
  });
});
