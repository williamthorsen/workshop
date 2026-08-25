import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolvePackageRoot } from '../resolvePackageRoot.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

describe(resolvePackageRoot, () => {
  describe('against the repo it runs in', () => {
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

    it('answers undefined for a package that is not installed', () => {
      expect(resolvePackageRoot('readyup-package-that-does-not-exist', REPO_ROOT)).toBeUndefined();
    });
  });

  describe('against a fixture project', () => {
    let fixtureRoot: string;
    let nestedDir: string;

    beforeAll(() => {
      // Resolve the real path up front: macOS reports `/var/...` for a temp dir that is really `/private/var/...`,
      // and the walk yields real paths.
      fixtureRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'resolve-package-root-')));
      nestedDir = path.join(fixtureRoot, 'packages', 'nested');
      mkdirSync(nestedDir, { recursive: true });

      const installed = path.join(fixtureRoot, 'node_modules', '@acme', 'kitpkg');
      mkdirSync(installed, { recursive: true });
      writeFileSync(path.join(installed, 'package.json'), '{"name":"@acme/kitpkg","version":"1.0.0"}\n');

      // A directory that occupies the name but has no manifest, which is not a package.
      mkdirSync(path.join(fixtureRoot, 'node_modules', 'readyup-fixture-manifestless'), { recursive: true });
    });

    afterAll(() => {
      rmSync(fixtureRoot, { recursive: true, force: true });
    });

    it('finds a package installed in an ancestor directory', () => {
      expect(resolvePackageRoot('@acme/kitpkg', nestedDir)).toBe(
        path.join(fixtureRoot, 'node_modules', '@acme', 'kitpkg'),
      );
    });

    it('ignores a node_modules entry that carries no manifest', () => {
      expect(resolvePackageRoot('readyup-fixture-manifestless', nestedDir)).toBeUndefined();
    });
  });
});
