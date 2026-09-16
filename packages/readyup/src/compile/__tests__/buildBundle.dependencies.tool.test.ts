import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { version as installedEsbuildVersion } from 'esbuild';
import { describe, expect, it as baseIt } from 'vitest';

import { readInstalledPackageVersion } from '../../test-utils/readInstalledPackageVersion.ts';
import { buildBundle, type BundleResult } from '../buildBundle.ts';

const KIT_SOURCE = [
  `import { broken } from 'broken-dep';`,
  `import { outer } from 'outer';`,
  `import { tiny } from 'tiny-dep';`,
  '',
  'export const kit = { broken, outer, tiny };',
].join('\n');

/** A repo module whose only import is `zod`, so bundling it reaches the pnpm store. */
const PNPM_INSTALLED_MODULE = path.resolve(import.meta.dirname, '../../manifest/manifestSchema.ts');

const it = baseIt
  .extend(
    'temp',
    { scope: 'file' },
    makeFixture(() =>
      createTempTree(
        {
          'kit.ts': KIT_SOURCE,
          // Anchors the compile on the fixture's own root rather than on whichever ancestor of the OS
          // temporary directory happens to hold a manifest.
          'package.json': JSON.stringify({ name: 'fixture', version: '1.0.0' }),

          ...packageEntries('node_modules/broken-dep', { name: 'broken-dep' }, [
            ['index.js', `export const broken = 'broken';\n`],
          ]),
          ...packageEntries('node_modules/outer', { name: 'outer', version: '2.0.0' }, [
            [
              'index.js',
              `import { inner } from 'inner';\nimport { tiny } from 'tiny-dep';\nexport const outer = { inner, tiny };\n`,
            ],
          ]),
          ...packageEntries('node_modules/outer/node_modules/inner', { name: 'inner', version: '3.0.0' }, [
            ['index.js', `export const inner = 'inner';\n`],
          ]),
          ...packageEntries('node_modules/outer/node_modules/tiny-dep', { name: 'tiny-dep', version: '2.1.0' }, [
            ['index.js', `export const tiny = 'tiny@2';\n`],
          ]),
          ...packageEntries('node_modules/tiny-dep', { name: 'tiny-dep', version: '1.0.0' }, [
            ['index.js', `import { util } from './util.js';\nexport const tiny = util;\n`],
            ['util.js', `export const util = 'tiny@1';\n`],
          ]),
        },
        { prefix: 'dependencies-' },
      ),
    ),
  )
  .extend('result', { scope: 'file' }, async ({ temp }): Promise<BundleResult> => buildBundle(temp.resolve('kit.ts')));

describe('buildBundle bundled dependencies', () => {
  it('records each bundled package by name with its declared version', ({ result }) => {
    expect(result.bundledDependencies).toMatchObject({ inner: '3.0.0', outer: '2.0.0' });
  });

  it('joins the versions when the bundle inlines two versions of one package', ({ result }) => {
    expect(result.bundledDependencies['tiny-dep']).toBe('1.0.0, 2.1.0');
  });

  it('omits a package whose package.json declares no version', ({ result }) => {
    expect(result.bundledDependencies).not.toHaveProperty('broken-dep');
  });

  it('sorts the record by package name', ({ result }) => {
    expect(Object.keys(result.bundledDependencies)).toStrictEqual(['inner', 'outer', 'tiny-dep']);
  });

  it('records the running esbuild as esbuildVersion', ({ result }) => {
    expect(result.esbuildVersion).toBe(installedEsbuildVersion);
  });

  it('records an empty bundledDependencies for a kit that bundles no packages', async ({ temp }) => {
    const barePath = temp.write('bare-kit.ts', 'export const kit = {};\n');

    const bare = await buildBundle(barePath);

    expect(bare.bundledDependencies).toStrictEqual({});
  });

  it('identifies a package installed through the pnpm store', async ({ temp }) => {
    const pnpmKitPath = temp.write(
      'pnpm-kit.ts',
      `export { ManifestSchema } from ${JSON.stringify(PNPM_INSTALLED_MODULE)};\n`,
    );

    const bundled = await buildBundle(pnpmKitPath);

    expect(bundled.bundledDependencies['zod']).toBe(readInstalledPackageVersion('zod'));
  });
});

// region | Helpers

/** Returns the tree entries for a package directory holding the given package.json body and files. */
function packageEntries(
  packageDir: string,
  packageJson: Record<string, string>,
  files: Array<[name: string, content: string]>,
): Record<string, string> {
  return {
    [`${packageDir}/package.json`]: JSON.stringify(packageJson),
    ...Object.fromEntries(files.map(([name, content]) => [`${packageDir}/${name}`, content])),
  };
}

// endregion | Helpers
