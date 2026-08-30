import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { beforeEach, describe, expect, it as baseIt, vi } from 'vitest';

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
  beforeEach(() => {
    // git resolves an attribute against the system-wide file and `core.attributesFile` as well as the repository's
    // own, so a developer declaring either linguist attribute globally would otherwise decide these assertions.
    vi.stubEnv('GIT_ATTR_NOSYSTEM', '1');
  });

  it('names a path each spelling of the declaration reaches, and no path left undeclared', async ({ temp }) => {
    temp.write(
      '.gitattributes',
      'bundles/*.mjs linguist-generated=true\nsrc/set.ts linguist-generated\nsrc/off.ts linguist-generated=false\nsrc/unset.ts -linguist-generated\nvendor/*.js linguist-vendored=true\n',
    );
    temp.write('bundles/bundle.mjs', 'bundled');
    temp.write('src/set.ts', 'declared');
    temp.write('src/off.ts', 'opted out');
    temp.write('src/unset.ts', 'unset');
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
  // Repository config outranks the global one, so this is what keeps a developer's `core.attributesFile` out.
  execFileSync('git', ['-C', temp.dir, 'config', 'core.attributesFile', '/dev/null']);
  execFileSync('git', ['-C', temp.dir, 'add', '--all']);
}

// endregion | Helpers
