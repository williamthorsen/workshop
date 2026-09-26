import assert from 'node:assert';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { resolveCompileRoot } from '../resolveCompileRoot.ts';

const MANIFEST = JSON.stringify({ name: 'fixture', version: '1.0.0' });

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  { scope: 'file' },
  makeFixture(() => {
    const tree = createTempTree(
      {
        'outer/deep/kits/': '',
        'outer/inner/kits/': '',
        'outer/inner/package.json': MANIFEST,
        'outer/package.json': MANIFEST,
        'unpackaged/kits/': '',
      },
      { prefix: 'compile-root-' },
    );

    // Two cases below assert that a walk reaching the filesystem root finds no manifest, which holds only
    // when no directory above the fixture has a manifest of its own.
    const ancestorManifest = findAncestorManifest(tree.dir);
    assert.ok(
      ancestorManifest === undefined,
      `${ancestorManifest} is above the fixture, so the unpackaged cases cannot be tested here`,
    );

    tree.symlink('link', tree.resolve('outer'));

    return tree;
  }),
);

describe(resolveCompileRoot, () => {
  it('returns the nearest ancestor containing a package.json', ({ temp }) => {
    const root = resolveCompileRoot(temp.resolve('outer/inner/kits/kit.ts'));

    expect(root).toBe(temp.resolve('outer/inner'));
  });

  it('walks past ancestors containing none', ({ temp }) => {
    const root = resolveCompileRoot(temp.resolve('outer/deep/kits/kit.ts'));

    expect(root).toBe(temp.resolve('outer'));
  });

  it("returns the source's own directory when no ancestor contains a package.json", ({ temp }) => {
    const kitsDir = temp.resolve('unpackaged/kits');

    expect(resolveCompileRoot(path.join(kitsDir, 'kit.ts'))).toBe(kitsDir);
  });

  it('returns a real path for a source reached through a symlinked ancestor', ({ temp }) => {
    const root = resolveCompileRoot(temp.resolve('link/inner/kits/kit.ts'));

    expect(root).toBe(temp.resolve('outer/inner'));
  });

  it('returns a path for a source that does not exist, leaving the failure to the bundler', ({ temp }) => {
    const kitsDir = temp.resolve('unpackaged/absent');

    expect(resolveCompileRoot(path.join(kitsDir, 'kit.ts'))).toBe(kitsDir);
  });
});

// region | Helpers

/** Returns the nearest directory at or above `fromDir` containing a `package.json`, or undefined when none does. */
function findAncestorManifest(fromDir: string): string | undefined {
  for (let directory = fromDir; ; directory = path.dirname(directory)) {
    if (existsSync(path.join(directory, 'package.json'))) return directory;
    if (path.dirname(directory) === directory) return undefined;
  }
}

// endregion | Helpers
