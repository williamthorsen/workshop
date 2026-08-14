import { version as installedEsbuildVersion } from 'esbuild';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildBundle } from '../buildBundle.ts';
import type { BundleResult } from '../buildBundle.ts';

const KIT_SOURCE = [
  `import { broken } from 'broken-dep';`,
  `import { outer } from 'outer';`,
  `import { tiny } from 'tiny-dep';`,
  '',
  'export const kit = { broken, outer, tiny };',
].join('\n');

/** A repo module whose only import is `zod`, so bundling it reaches the pnpm store. */
const PNPM_INSTALLED_MODULE = path.resolve(import.meta.dirname, '../../manifest/manifestSchema.ts');

describe('buildBundle bundled dependencies', () => {
  let treeRoot: string;
  let result: BundleResult;

  beforeAll(async () => {
    treeRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'dependencies-')));
    writeFileSync(path.join(treeRoot, 'kit.ts'), KIT_SOURCE);

    writePackage(path.join(treeRoot, 'node_modules', 'tiny-dep'), { name: 'tiny-dep', version: '1.0.0' }, [
      ['index.js', `import { util } from './util.js';\nexport const tiny = util;\n`],
      ['util.js', `export const util = 'tiny@1';\n`],
    ]);
    writePackage(path.join(treeRoot, 'node_modules', 'outer'), { name: 'outer', version: '2.0.0' }, [
      [
        'index.js',
        `import { inner } from 'inner';\nimport { tiny } from 'tiny-dep';\nexport const outer = { inner, tiny };\n`,
      ],
    ]);
    writePackage(
      path.join(treeRoot, 'node_modules', 'outer', 'node_modules', 'inner'),
      { name: 'inner', version: '3.0.0' },
      [['index.js', `export const inner = 'inner';\n`]],
    );
    writePackage(
      path.join(treeRoot, 'node_modules', 'outer', 'node_modules', 'tiny-dep'),
      { name: 'tiny-dep', version: '2.1.0' },
      [['index.js', `export const tiny = 'tiny@2';\n`]],
    );
    writePackage(path.join(treeRoot, 'node_modules', 'broken-dep'), { name: 'broken-dep' }, [
      ['index.js', `export const broken = 'broken';\n`],
    ]);

    result = await buildBundle(path.join(treeRoot, 'kit.ts'));
  });

  afterAll(() => {
    rmSync(treeRoot, { recursive: true, force: true });
  });

  it('records each bundled package by name with its declared version', () => {
    expect(result.bundledDependencies).toMatchObject({ inner: '3.0.0', outer: '2.0.0' });
  });

  it('joins the versions when the bundle inlines two versions of one package', () => {
    expect(result.bundledDependencies['tiny-dep']).toBe('1.0.0, 2.1.0');
  });

  it('omits a package whose package.json declares no version', () => {
    expect(result.bundledDependencies).not.toHaveProperty('broken-dep');
  });

  it('sorts the record by package name', () => {
    expect(Object.keys(result.bundledDependencies)).toStrictEqual(['inner', 'outer', 'tiny-dep']);
  });

  it('records the running esbuild as esbuildVersion', () => {
    expect(result.esbuildVersion).toBe(installedEsbuildVersion);
  });

  it('records nothing for a kit that bundles no packages', async () => {
    writeFileSync(path.join(treeRoot, 'bare-kit.ts'), 'export const kit = {};\n');

    const bare = await buildBundle(path.join(treeRoot, 'bare-kit.ts'));

    expect(bare.bundledDependencies).toStrictEqual({});
  });

  it('identifies a package installed through the pnpm store', async () => {
    writeFileSync(
      path.join(treeRoot, 'pnpm-kit.ts'),
      `export { ManifestSchema } from ${JSON.stringify(PNPM_INSTALLED_MODULE)};\n`,
    );

    const bundled = await buildBundle(path.join(treeRoot, 'pnpm-kit.ts'));

    expect(bundled.bundledDependencies['zod']).toBe(readInstalledZodVersion());
  });
});

// region | Helpers

/** Reads the version of the zod this package resolves, which is the one bundling `manifestSchema.ts` inlines. */
function readInstalledZodVersion(): string {
  const require = createRequire(import.meta.url);
  const parsed: unknown = JSON.parse(readFileSync(require.resolve('zod/package.json'), 'utf8'));
  // Test-only assertion shortcut; the shape of an installed package.json is not under test.
  return (parsed as { version: string }).version;
}

/** Writes a package directory with the given package.json body and files. */
function writePackage(
  packageDir: string,
  packageJson: Record<string, string>,
  files: Array<[name: string, content: string]>,
): void {
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(packageJson));
  for (const [name, content] of files) {
    writeFileSync(path.join(packageDir, name), content);
  }
}

// endregion | Helpers
