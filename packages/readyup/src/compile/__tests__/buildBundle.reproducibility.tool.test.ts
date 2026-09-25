import path from 'node:path';

import { createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { buildBundle, type BundleResult } from '../buildBundle.ts';

const KIT_SOURCE = [
  `import { pickJson } from '${path.resolve(import.meta.dirname, '../pickJson.ts')}';`,
  `import { helper } from './helper.ts';`,
  `import { tiny } from 'tiny-dep';`,
  '',
  `export const meta = pickJson('./data.json', ['version']);`,
  'export const kit = { helper, meta, tiny };',
].join('\n');

const it = baseIt
  .extend(
    'temp',
    { scope: 'file' },
    makeFixture(() =>
      createTempTree(
        {
          'kits/data.json': JSON.stringify({ name: 'fixture', version: '1.0.0' }),
          'kits/helper.ts': "export const helper = 'helper';\n",
          'kits/kit.ts': KIT_SOURCE,
          'node_modules/tiny-dep/index.js': 'export const tiny = 1;\n',
          'node_modules/tiny-dep/package.json': JSON.stringify({ name: 'tiny-dep', version: '1.0.0' }),
          // Anchors the compile on the fixture's own root rather than on whichever ancestor of the OS
          // temporary directory happens to contain a manifest.
          'package.json': JSON.stringify({ name: 'fixture', version: '1.0.0' }),
        },
        { prefix: 'reproducibility-' },
      ),
    ),
  )
  .extend('builds', { scope: 'file' }, async ({ temp }): Promise<Builds> => {
    const kitPath = temp.resolve('kits/kit.ts');

    const fromRepo = await buildBundle(kitPath);
    using _cwd = pointCwdAt(temp.resolve('kits'), { chdir: true });
    const fromKitsDir = await buildBundle(kitPath);

    return { fromKitsDir, fromRepo };
  });

/** The same kit compiled twice, once from the repo and once from the kit's own directory. */
interface Builds {
  fromKitsDir: BundleResult;
  fromRepo: BundleResult;
}

/**
 * Compiles one kit from directories that are neither its own nor each other's, which is the property
 * on which `rdy verify --rebuild` depends: It recompiles in whatever directory the verification runs in.
 */
describe('buildBundle reproducibility', () => {
  it('produces identical bytes whatever directory the compile runs in', ({ builds }) => {
    expect(builds.fromKitsDir.bytes.equals(builds.fromRepo.bytes)).toBe(true);
  });

  it('records the same input closure', ({ builds }) => {
    expect(builds.fromKitsDir.inputs).toStrictEqual(builds.fromRepo.inputs);
  });

  it('records the same bundled dependencies', ({ builds }) => {
    expect(builds.fromKitsDir.bundledDependencies).toStrictEqual(builds.fromRepo.bundledDependencies);
  });

  it("names each bundled module against the kit's package root", ({ builds }) => {
    // The bundle is identical under any anchor derived from the kit, so this assertion pins the anchor
    // to the one under which every committed bundle was compiled.
    expect(builds.fromRepo.bytes.toString('utf8')).toContain('// kits/kit.ts');
  });
});
