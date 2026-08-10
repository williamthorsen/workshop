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

// Declares the opposite of both kit settings: `experimentalDecorators` directly, and
// `useDefineForClassFields` through the `target` esbuild derives it from.
const HOST_TSCONFIG = JSON.stringify({ compilerOptions: { experimentalDecorators: true, target: 'ES2020' } });

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

/** Writes the host config into the directory above a kit, where esbuild's search would reach it. */
function writeHostTsconfig(entryPath: string): void {
  writeFileSync(path.resolve(path.dirname(entryPath), '..', 'tsconfig.json'), HOST_TSCONFIG, 'utf8');
}

// endregion | Helpers
