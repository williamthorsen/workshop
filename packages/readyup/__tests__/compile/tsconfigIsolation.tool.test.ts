import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { buildBundle } from '../../src/compile/buildBundle.ts';

// A decorator and a class field, so the fixture exercises both settings the kit tsconfig declares.
const KIT_SOURCE = [
  'declare const decorate: (...args: never[]) => void;',
  'export class Kit {',
  '  field = 1;',
  '  @decorate run() {}',
  '}',
  '',
].join('\n');

// The same field without the decorator, which moves every field into the constructor and takes the
// class-body form of a defined field with it.
const FIELD_SOURCE = ['export class Kit {', '  field = 1;', '}', ''].join('\n');

// Declares the opposite of both kit settings -- `experimentalDecorators` directly, and
// `useDefineForClassFields` through the `target` esbuild derives it from -- plus an alias that
// resolves, so every assertion below fails if a kit ever reads a host config again.
const HOST_TSCONFIG = JSON.stringify({
  compilerOptions: { experimentalDecorators: true, paths: { '~/*': ['./src/*'] }, target: 'ES2020' },
});

const ALIASED_MODULE = "export const thing = 'aliased';\n";

const treeRoots: string[] = [];

describe(buildBundle, () => {
  afterAll(async () => {
    await Promise.all(treeRoots.map((root) => rm(root, { recursive: true, force: true })));
  });

  it('compiles to identical bytes whether or not a tsconfig.json sits above the kit', async () => {
    const entryPath = writeKitTree(KIT_SOURCE);

    const withoutHostConfig = await buildBundle(entryPath);
    writeHostTsconfig(entryPath);
    const withHostConfig = await buildBundle(entryPath);

    expect(withHostConfig.equals(withoutHostConfig)).toBe(true);
  });

  it('compiles class fields and decorators under the declared settings', async () => {
    const fieldBundle = (await buildBundle(writeKitTree(FIELD_SOURCE))).toString('utf8');
    const decoratorBundle = (await buildBundle(writeKitTree(KIT_SOURCE))).toString('utf8');

    // esbuild names no setting in its output, so the declared values are read back from the lowering
    // they produce: a defined field stays in the class body where an assigned one moves into the
    // constructor, and a proposal-style decorator reaches for `__decorateElement` where the legacy one
    // reaches for `__decorateClass`.
    expect(fieldBundle).toContain('field = 1');
    expect(fieldBundle).not.toContain('this.field = 1');
    expect(decoratorBundle).toContain('__decorateElement');
    expect(decoratorBundle).not.toContain('__decorateClass');
  });

  it('reports that kits compile without a tsconfig.json when an import does not resolve', async () => {
    const entryPath = writeKitTree("import { thing } from '~/thing';\nexport const kit = thing;\n");
    writeHostTsconfig(entryPath);

    await expect(buildBundle(entryPath)).rejects.toThrow(/kits compile without a tsconfig\.json/i);
  });
});

// region | Helpers

/**
 * Writes a kit source into a fresh temp tree and returns the kit's path.
 *
 * The tree sits outside the repository, so nothing above it is discoverable but what a test puts
 * there, and the kit sits one directory below the tree root, leaving room for a config above it.
 */
function writeKitTree(source: string): string {
  const treeRoot = mkdtempSync(path.join(tmpdir(), 'rdy-host-tsconfig-'));
  treeRoots.push(treeRoot);
  const kitsDir = path.join(treeRoot, 'kits');
  mkdirSync(kitsDir);
  const entryPath = path.join(kitsDir, 'kit.ts');
  writeFileSync(entryPath, source, 'utf8');
  return entryPath;
}

/**
 * Writes the host config into the directory above a kit, where esbuild's search would reach it.
 *
 * The module the config's `paths` entry maps to is written alongside it, so the alias would resolve
 * and a kit reading the config would compile rather than fail.
 */
function writeHostTsconfig(entryPath: string): void {
  const treeRoot = path.resolve(path.dirname(entryPath), '..');
  mkdirSync(path.join(treeRoot, 'src'));
  writeFileSync(path.join(treeRoot, 'src', 'thing.ts'), ALIASED_MODULE, 'utf8');
  writeFileSync(path.join(treeRoot, 'tsconfig.json'), HOST_TSCONFIG, 'utf8');
}

// endregion | Helpers
