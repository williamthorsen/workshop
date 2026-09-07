import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { buildBundle } from '../buildBundle.ts';

// A kit that imports only the builtin-free export, so tree-shaking removes the sole consumer of every
// externalized specifier the helper module imports.
const KIT_DROPPING_HELPER = "import { greeting } from './helpers.ts';\nexport const kit = greeting();\n";

// The same helper module reached through its externalized-specifier consumer, so every import survives.
const KIT_KEEPING_HELPER = "import { consume } from './helpers.ts';\nexport const kit = consume();\n";

const treeRoots: string[] = [];

describe(buildBundle, () => {
  afterAll(async () => {
    await Promise.all(treeRoots.map((root) => rm(root, { recursive: true, force: true })));
  });

  it.each([
    ['named', "import { readdirSync } from 'node:fs';", 'readdirSync'],
    ['default', "import readdirSync from 'node:fs';", 'readdirSync'],
    ['namespace', "import * as readdirSync from 'node:fs';", 'readdirSync'],
  ])('drops an orphaned %s import of a node: builtin', async (_form, statement, binding) => {
    const entryPath = writeKitTree(statement, binding);

    const bundle = (await buildBundle(entryPath)).bytes.toString('utf8');

    expect(importLines(bundle)).toStrictEqual([]);
  });

  it.each([
    ['the package root', "import { defineRdyKit } from 'readyup';", 'defineRdyKit'],
    ['a subpath', "import { fileExists } from 'readyup/check-utils';", 'fileExists'],
  ])('drops an orphaned import of %s', async (_subject, statement, binding) => {
    const entryPath = writeKitTree(statement, binding);

    const bundle = (await buildBundle(entryPath)).bytes.toString('utf8');

    expect(importLines(bundle)).toStrictEqual([]);
  });

  it('keeps a referenced node: import', async () => {
    const entryPath = writeKitTree("import { readdirSync } from 'node:fs';", 'readdirSync', KIT_KEEPING_HELPER);

    const bundle = (await buildBundle(entryPath)).bytes.toString('utf8');

    expect(importLines(bundle)).toStrictEqual(['import { readdirSync } from "node:fs";']);
  });

  it('keeps a referenced readyup import external rather than inlining the package', async () => {
    const entryPath = writeKitTree(
      "import { fileExists } from 'readyup/check-utils';",
      'fileExists',
      KIT_KEEPING_HELPER,
    );

    const result = await buildBundle(entryPath);

    expect(importLines(result.bytes.toString('utf8'))).toStrictEqual([
      'import { fileExists } from "readyup/check-utils";',
    ]);
    // The closure records what the bundle inlined, so an inlined readyup would appear as an input of its own.
    expect(result.inputs.some((input) => input.path.includes('readyup'))).toBe(false);
  });

  it('compiles a node: specifier that esbuild does not recognize', async () => {
    // What makes dropping `node:*` from `external` safe: esbuild externalizes the whole `node:` prefix
    // under `platform: 'node'` rather than a fixed list, so a builtin newer than esbuild still resolves.
    const entryPath = writeKitTree("import { open } from 'node:not_a_real_builtin';", 'open', KIT_KEEPING_HELPER);

    const bundle = (await buildBundle(entryPath)).bytes.toString('utf8');

    expect(importLines(bundle)).toStrictEqual(['import { open } from "node:not_a_real_builtin";']);
  });
});

// region | Helpers

/** Returns the bundle's import statements, which esbuild emits one per line. */
function importLines(bundle: string): string[] {
  return bundle.split('\n').filter((line) => line.startsWith('import '));
}

/**
 * Writes a two-export helper module and the kit that consumes it into a fresh temp tree, and returns the
 * kit's path.
 *
 * `binding` is referenced by `consume` alone, so which kit source is supplied decides whether the import
 * of `binding` has a surviving consumer. The tree sits outside the repository, so nothing above it is
 * discoverable but what the test puts there.
 */
function writeKitTree(importStatement: string, binding: string, kitSource = KIT_DROPPING_HELPER): string {
  const treeRoot = mkdtempSync(path.join(tmpdir(), 'rdy-orphaned-imports-'));
  treeRoots.push(treeRoot);
  const kitsDir = path.join(treeRoot, 'kits');
  mkdirSync(kitsDir);

  const helperSource = [
    importStatement,
    `export function consume(): unknown { return ${binding}; }`,
    "export function greeting(): string { return 'hi'; }",
    '',
  ].join('\n');
  writeFileSync(path.join(kitsDir, 'helpers.ts'), helperSource, 'utf8');

  const entryPath = path.join(kitsDir, 'kit.ts');
  writeFileSync(entryPath, kitSource, 'utf8');
  return entryPath;
}

// endregion | Helpers
