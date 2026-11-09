import { createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { createFakeGit, type FakeGit } from '../../git/test-utils/fake-git.ts';
import { createForeignPathsLister } from '../listForeignPaths.ts';
import { createTrackedFilesLister } from '../listTrackedFiles.ts';

const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-foreign-' })),
);

const DECLARED = declare({ 'src/bundle.mjs': 'true', 'src/hand.ts': 'unspecified' });

describe(createForeignPathsLister, () => {
  // The tracked lister probes `process.cwd()` for existence before asking git, so `cwd` must name a real directory.
  it.aroundEach(async (runTest, { temp }) => {
    using _cwd = pointCwdAt(temp.dir);

    await runTest();
  });

  it('writes every tracked path to stdin, NUL-terminated, and asks about both attributes', async () => {
    const git = createGitTracking(['src/bundle.mjs', 'src/hand.ts']);

    await createListerOver(git)();

    expect(git.runGitWithInput).toHaveBeenCalledWith(
      process.cwd(),
      'src/bundle.mjs\0src/hand.ts\0',
      'check-attr',
      '-z',
      '--stdin',
      'linguist-generated',
      'linguist-vendored',
    );
  });

  it('invokes git once for a later call, which reads the memoized set', async () => {
    const git = createGitTracking(['src/bundle.mjs', 'src/hand.ts']);
    const listForeignPaths = createListerOver(git);

    await listForeignPaths();
    await listForeignPaths();

    expect(git.runGitWithInput).toHaveBeenCalledTimes(1);
  });

  it('invokes git once for calls that run concurrently', async () => {
    const git = createGitTracking(['src/bundle.mjs', 'src/hand.ts']);
    const listForeignPaths = createListerOver(git);

    const [first, second] = await Promise.all([listForeignPaths(), listForeignPaths()]);

    expect(first).toStrictEqual(new Set(['src/bundle.mjs']));
    expect(second).toStrictEqual(new Set(['src/bundle.mjs']));
    expect(git.runGitWithInput).toHaveBeenCalledTimes(1);
  });

  it('does not memoize a rejected lookup', async () => {
    const git = createGitTracking(['src/bundle.mjs', 'src/hand.ts']);
    git.runGitWithInput.mockRejectedValueOnce(new Error('fatal: unable to read index'));
    const listForeignPaths = createListerOver(git);

    await expect(listForeignPaths()).rejects.toThrow('unable to read index');
    await expect(listForeignPaths()).resolves.toStrictEqual(new Set(['src/bundle.mjs']));
  });

  it('invokes git for nothing when the working tree tracks no file', async () => {
    const git = createGitTracking([]);

    await expect(createListerOver(git)()).resolves.toStrictEqual(new Set());
    expect(git.runGitWithInput).not.toHaveBeenCalled();
  });

  it('returns an empty set outside a git working tree, invoking git for nothing', async () => {
    const git = createFakeGit({
      'rev-parse --git-dir': Object.assign(new Error('fatal: not a git repository'), { code: 128 }),
    });

    await expect(createListerOver(git)()).resolves.toStrictEqual(new Set());
    expect(git.runGitWithInput).not.toHaveBeenCalled();
  });
});

// region | Helpers

/** Returns a fake git whose working tree tracks `paths` and declares `DECLARED` for them. */
function createGitTracking(paths: readonly string[]): FakeGit {
  return createFakeGit({
    'rev-parse --git-dir': '.git',
    'ls-files': paths.map((path) => `${path}\0`).join(''),
    'check-attr': DECLARED,
  });
}

/** Returns a foreign-paths lister over `git`, reading its tracked paths from a tracked lister over the same fake. */
function createListerOver(git: FakeGit): () => Promise<ReadonlySet<string>> {
  return createForeignPathsLister(git, createTrackedFilesLister(git));
}

/** Renders a `check-attr -z` response declaring the given `linguist-generated` value for each path. */
function declare(valuesByPath: Record<string, string>): string {
  return Object.entries(valuesByPath)
    .flatMap(([path, value]) => [
      `${path}\0linguist-generated\0${value}\0`,
      `${path}\0linguist-vendored\0unspecified\0`,
    ])
    .join('');
}

// endregion | Helpers
