import fs from 'node:fs';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { resolvePnpmProvider } from '../resolvePnpmProvider.ts';

const ACTIVE = '24.20.0';
const OLD = '24.18.1';

const COREPACK_TARGET = '../lib/node_modules/corepack/dist/pnpm.js';
const PNPM_TARGET = '../lib/node_modules/pnpm/bin/pnpm.cjs';

describe(resolvePnpmProvider, () => {
  it('reports pnpm absent when no PATH directory provides it', () => {
    using tree = createTempTree({ 'path/other': '' });

    expect(resolvePnpmProvider(buildOptions(tree))).toStrictEqual({ kind: 'absent' });
  });

  it('reports the asdf plugin for a shim naming it, with the .tool-versions entry in reach', () => {
    using tree = createTempTree({
      'home/repo/.tool-versions': 'pnpm 9.0.0\n',
      'shims/pnpm': renderShim(['pnpm 9.0.0', 'nodejs 24.20.0']),
    });
    markExecutable(tree, 'shims/pnpm');

    expect(resolvePnpmProvider(buildOptions(tree))).toStrictEqual({
      kind: 'asdf-plugin',
      path: tree.resolve('shims/pnpm'),
      toolVersions: { filePath: tree.resolve('home/repo/.tool-versions'), version: '9.0.0' },
      versions: ['9.0.0'],
    });
  });

  it('leaves the entry undefined when no .tool-versions in reach selects the plugin', () => {
    using tree = createTempTree({ 'shims/pnpm': renderShim(['pnpm 9.0.0']) });
    markExecutable(tree, 'shims/pnpm');

    expect(resolvePnpmProvider(buildOptions(tree))).toMatchObject({ kind: 'asdf-plugin', toolVersions: undefined });
  });

  it.each([
    ['corepack', COREPACK_TARGET],
    ['npm-global', PNPM_TARGET],
  ])('reports %s under the running nodejs version, read from its bin symlink', (kind, target) => {
    using tree = createTempTree({ 'shims/pnpm': renderShim(['nodejs 24.20.0', 'nodejs 24.18.1']) });
    markExecutable(tree, 'shims/pnpm');
    linkBin(tree, ACTIVE, target);

    expect(resolvePnpmProvider(buildOptions(tree))).toStrictEqual({
      kind,
      nodeVersion: ACTIVE,
      path: tree.resolve('shims/pnpm'),
    });
  });

  it('reports a shim stranded when its header names nodejs but not the running version', () => {
    using tree = createTempTree({ 'shims/pnpm': renderShim(['nodejs 24.18.1']) });
    markExecutable(tree, 'shims/pnpm');
    linkBin(tree, OLD, COREPACK_TARGET);

    expect(resolvePnpmProvider(buildOptions(tree))).toStrictEqual({
      kind: 'stranded-shim',
      path: tree.resolve('shims/pnpm'),
      providingVersions: [OLD],
    });
  });

  it('reports a nodejs shim stranded when the running node is not an asdf install', () => {
    using tree = createTempTree({ 'shims/pnpm': renderShim(['nodejs 24.20.0']) });
    markExecutable(tree, 'shims/pnpm');

    const provider = resolvePnpmProvider({ ...buildOptions(tree), execPath: '/opt/homebrew/bin/node' });

    expect(provider).toMatchObject({ kind: 'stranded-shim', providingVersions: [ACTIVE] });
  });

  it('names a nodejs shim by path when its bin symlink names another package', () => {
    using tree = createTempTree({ 'shims/pnpm': renderShim(['nodejs 24.20.0']) });
    markExecutable(tree, 'shims/pnpm');
    linkBin(tree, ACTIVE, '../lib/node_modules/@pnpm/exe/pnpm');

    expect(resolvePnpmProvider(buildOptions(tree))).toStrictEqual({ kind: 'path', path: tree.resolve('shims/pnpm') });
  });

  it('names a shim of another plugin by path', () => {
    using tree = createTempTree({ 'shims/pnpm': renderShim(['python 3.13.1']) });
    markExecutable(tree, 'shims/pnpm');

    expect(resolvePnpmProvider(buildOptions(tree))).toStrictEqual({ kind: 'path', path: tree.resolve('shims/pnpm') });
  });

  it('reads the bin symlink of a pnpm outside asdf, with no nodejs version', () => {
    using tree = createTempTree({ 'path/lib/node_modules/corepack/dist/pnpm.js': '#!/usr/bin/env node\n' });
    markExecutable(tree, 'path/lib/node_modules/corepack/dist/pnpm.js');
    fs.mkdirSync(tree.resolve('path/bin'));
    fs.symlinkSync(COREPACK_TARGET, tree.resolve('path/bin/pnpm'));

    expect(resolvePnpmProvider({ ...buildOptions(tree), pathDirs: [tree.resolve('path/bin')] })).toStrictEqual({
      kind: 'corepack',
      nodeVersion: undefined,
      path: tree.resolve('path/bin/pnpm'),
    });
  });

  it("reads the bin symlink in an asdf nodejs install's own bin directory, with that version", () => {
    using tree = createTempTree({});
    linkBin(tree, ACTIVE, COREPACK_TARGET);
    tree.write(`installs/nodejs/${ACTIVE}/lib/node_modules/corepack/dist/pnpm.js`, '#!/usr/bin/env node\n');
    markExecutable(tree, `installs/nodejs/${ACTIVE}/lib/node_modules/corepack/dist/pnpm.js`);

    const pathDirs = [tree.resolve(`installs/nodejs/${ACTIVE}/bin`)];

    expect(resolvePnpmProvider({ ...buildOptions(tree), pathDirs })).toStrictEqual({
      kind: 'corepack',
      nodeVersion: ACTIVE,
      path: tree.resolve(`installs/nodejs/${ACTIVE}/bin/pnpm`),
    });
  });

  it('names a plain executable by path', () => {
    using tree = createTempTree({ 'path/pnpm': '#!/bin/sh\necho 9.0.0\n' });
    markExecutable(tree, 'path/pnpm');

    expect(resolvePnpmProvider({ ...buildOptions(tree), pathDirs: [tree.resolve('path')] })).toStrictEqual({
      kind: 'path',
      path: tree.resolve('path/pnpm'),
    });
  });

  it('takes the first pnpm on PATH, which is the one that runs', () => {
    using tree = createTempTree({ 'path/pnpm': '', 'shims/pnpm': renderShim(['pnpm 9.0.0']) });
    markExecutable(tree, 'path/pnpm');
    markExecutable(tree, 'shims/pnpm');

    const provider = resolvePnpmProvider({
      ...buildOptions(tree),
      pathDirs: [tree.resolve('path'), tree.resolve('shims')],
    });

    expect(provider).toStrictEqual({ kind: 'path', path: tree.resolve('path/pnpm') });
  });
});

// region | Helpers

/** Builds options under an asdf-managed node at the active version, with the tree's shims directory on PATH. */
function buildOptions(tree: TempTree) {
  return {
    cwd: tree.resolve('home/repo'),
    execPath: tree.resolve(`installs/nodejs/${ACTIVE}/bin/node`),
    homeDir: tree.resolve('home'),
    pathDirs: [tree.resolve('shims')],
  };
}

/** Writes the `bin/pnpm` symlink that an install leaves under a nodejs version, pointing at a target relative to `bin/`. */
function linkBin(tree: TempTree, version: string, target: string): void {
  fs.mkdirSync(tree.resolve(`installs/nodejs/${version}/bin`), { recursive: true });
  fs.symlinkSync(target, tree.resolve(`installs/nodejs/${version}/bin/pnpm`));
}

/** Sets the execute bit, which `createTempTree` does not, so that the file counts as an executable on PATH. */
function markExecutable(tree: TempTree, entryPath: string): void {
  fs.chmodSync(tree.resolve(entryPath), 0o755);
}

/** Renders a `pnpm` shim as asdf writes it, one `# asdf-plugin:` line per `<plugin> <version>` entry. */
function renderShim(providers: string[]): string {
  const header = providers.map((provider) => `# asdf-plugin: ${provider}`).join('\n');

  return `#!/usr/bin/env bash\n${header}\nexec asdf exec "pnpm" "$@"`;
}

// endregion | Helpers
