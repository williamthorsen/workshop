import assert from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveCompileRoot } from '../resolveCompileRoot.ts';

const MANIFEST = JSON.stringify({ name: 'fixture', version: '1.0.0' });

describe(resolveCompileRoot, () => {
  let treeRoot: string;

  beforeAll(() => {
    treeRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'compile-root-')));

    // Two cases below assert that a walk reaching the filesystem root finds no manifest, which only holds
    // where no directory above the fixture has a manifest of its own.
    const ancestorManifest = findAncestorManifest(treeRoot);
    assert.ok(
      ancestorManifest === undefined,
      `${ancestorManifest} sits above the fixture, so the unpackaged cases cannot be tested here`,
    );

    writePackage(path.join(treeRoot, 'outer'));
    writePackage(path.join(treeRoot, 'outer', 'inner'));
    mkdirSync(path.join(treeRoot, 'outer', 'inner', 'kits'), { recursive: true });
    mkdirSync(path.join(treeRoot, 'outer', 'deep', 'kits'), { recursive: true });
    mkdirSync(path.join(treeRoot, 'unpackaged', 'kits'), { recursive: true });

    symlinkSync(path.join(treeRoot, 'outer'), path.join(treeRoot, 'link'), 'dir');
  });

  afterAll(() => {
    rmSync(treeRoot, { recursive: true, force: true });
  });

  it('returns the nearest ancestor holding a package.json', () => {
    const root = resolveCompileRoot(path.join(treeRoot, 'outer', 'inner', 'kits', 'kit.ts'));

    expect(root).toBe(path.join(treeRoot, 'outer', 'inner'));
  });

  it('walks past ancestors holding none', () => {
    const root = resolveCompileRoot(path.join(treeRoot, 'outer', 'deep', 'kits', 'kit.ts'));

    expect(root).toBe(path.join(treeRoot, 'outer'));
  });

  it("returns the source's own directory when no ancestor holds a package.json", () => {
    const kitsDir = path.join(treeRoot, 'unpackaged', 'kits');

    expect(resolveCompileRoot(path.join(kitsDir, 'kit.ts'))).toBe(kitsDir);
  });

  it('returns a real path for a source reached through a symlinked ancestor', () => {
    const root = resolveCompileRoot(path.join(treeRoot, 'link', 'inner', 'kits', 'kit.ts'));

    expect(root).toBe(path.join(treeRoot, 'outer', 'inner'));
  });

  it('returns a path for a source that does not exist, leaving the failure to the bundler', () => {
    const kitsDir = path.join(treeRoot, 'unpackaged', 'absent');

    expect(resolveCompileRoot(path.join(kitsDir, 'kit.ts'))).toBe(kitsDir);
  });
});

// region | Helpers

/** Returns the nearest directory at or above `fromDir` holding a `package.json`, or undefined where none does. */
function findAncestorManifest(fromDir: string): string | undefined {
  for (let directory = fromDir; ; directory = path.dirname(directory)) {
    if (existsSync(path.join(directory, 'package.json'))) return directory;
    if (path.dirname(directory) === directory) return undefined;
  }
}

/** Creates a directory and the minimal `package.json` that makes it a package root. */
function writePackage(directory: string): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'package.json'), MANIFEST);
}

// endregion | Helpers
