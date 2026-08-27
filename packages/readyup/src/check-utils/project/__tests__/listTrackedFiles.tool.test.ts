import { execFileSync } from 'node:child_process';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { listTrackedFiles } from '../listTrackedFiles.ts';

// Separated from the module's unit suite, which stubs git: only real git escapes and quotes a path,
// so only real git can show that `-z` defeats it.
// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-tracked-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

describe(listTrackedFiles, () => {
  it('returns a path holding a non-ASCII byte intact and unquoted', async ({ temp }) => {
    temp.write('packages/ascii/index.ts', 'export const value = 1;\n');
    temp.write('packages/日本語/index.ts', 'export const value = 2;\n');
    initRepository(temp);

    await expect(listTrackedFiles()).resolves.toStrictEqual(['packages/ascii/index.ts', 'packages/日本語/index.ts']);
  });

  it('returns undefined outside a git working tree', async ({ temp }) => {
    temp.write('packages/ascii/index.ts', 'export const value = 1;\n');

    await expect(listTrackedFiles()).resolves.toBeUndefined();
  });
});

// region | Helpers

/** Initializes a git repository over the temporary directory and stages everything in it. */
function initRepository(temp: TempTree): void {
  execFileSync('git', ['-C', temp.dir, 'init', '--quiet']);
  // Pinned rather than inherited: quoting is git's default, and a reader whose global config disables it would
  // otherwise see this suite pass against a listing built without `-z`.
  execFileSync('git', ['-C', temp.dir, 'config', 'core.quotePath', 'true']);
  execFileSync('git', ['-C', temp.dir, 'add', '--all']);
}

// endregion | Helpers
