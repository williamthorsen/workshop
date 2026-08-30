import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { listForeignPaths } from '../listForeignPaths.ts';

// Separated from the module's unit suite, which stubs git: the attribute values, the nested-`.gitattributes`
// precedence, and the relative-path resolution are all git's, and a stub asserting them would pass against a git
// that disagreed.
// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-foreign-' })),
);

describe(listForeignPaths, () => {
  it('names a path each spelling of the declaration reaches, and no path left undeclared', async ({ temp }) => {
    temp.write(
      '.gitattributes',
      'bundles/*.mjs linguist-generated=true\nsrc/set.ts linguist-generated\nsrc/off.ts linguist-generated=false\nvendor/*.js linguist-vendored=true\n',
    );
    temp.write('bundles/bundle.mjs', 'bundled');
    temp.write('src/set.ts', 'declared');
    temp.write('src/off.ts', 'opted out');
    temp.write('src/hand.ts', 'hand-written');
    temp.write('vendor/jquery.js', 'vendored');
    initRepository(temp);
    using _cwd = pointCwdAt(temp.dir);

    await expect(listForeignPaths()).resolves.toStrictEqual(
      new Set(['bundles/bundle.mjs', 'src/set.ts', 'vendor/jquery.js']),
    );
  });

  it('applies a declaration a nested .gitattributes makes, which git resolves against its own directory', async ({
    temp,
  }) => {
    temp.write('packages/agents/.gitattributes', '*.mjs linguist-generated=true\n');
    temp.write('packages/agents/skill.mjs', 'bundled');
    temp.write('packages/agents/skill.ts', 'hand-written');
    temp.write('packages/other/tool.mjs', 'hand-written');
    initRepository(temp);
    using _cwd = pointCwdAt(temp.dir);

    await expect(listForeignPaths()).resolves.toStrictEqual(new Set(['packages/agents/skill.mjs']));
  });

  it('matches a repository-root declaration from a subdirectory, both commands working in relative paths', async ({
    temp,
  }) => {
    temp.write('.gitattributes', 'sub/*.mjs linguist-generated=true\n');
    temp.write('sub/bundle.mjs', 'bundled');
    temp.write('sub/source.ts', 'hand-written');
    initRepository(temp);
    using _cwd = pointCwdAt(join(temp.dir, 'sub'));

    await expect(listForeignPaths()).resolves.toStrictEqual(new Set(['bundle.mjs']));
  });

  it('returns an empty set outside a git working tree', async ({ temp }) => {
    temp.write('src/hand.ts', 'hand-written');
    using _cwd = pointCwdAt(temp.dir);

    await expect(listForeignPaths()).resolves.toStrictEqual(new Set());
  });
});

// region | Helpers

/** Initializes a git repository over the temporary directory and stages everything in it. */
function initRepository(temp: TempTree): void {
  execFileSync('git', ['-C', temp.dir, 'init', '--quiet']);
  execFileSync('git', ['-C', temp.dir, 'add', '--all']);
}

// endregion | Helpers
