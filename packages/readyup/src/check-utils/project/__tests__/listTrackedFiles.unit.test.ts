import { createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { createFakeGit, type FakeGit } from '../../git/test-utils/fake-git.ts';
import { createTrackedFilesLister } from '../listTrackedFiles.ts';

const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-tracked-' })),
);

describe(createTrackedFilesLister, () => {
  // The lister probes `process.cwd()` for existence before asking git, so `cwd` must name a real directory.
  it.aroundEach(async (runTest, { temp }) => {
    using _cwd = pointCwdAt(temp.dir);

    await runTest();
  });

  it('returns undefined outside a git working tree', async () => {
    const git = createFakeGit({
      'rev-parse --git-dir': Object.assign(new Error('fatal: not a git repository'), { code: 128 }),
    });

    await expect(createTrackedFilesLister(git)()).resolves.toBeUndefined();
  });

  it('returns an empty list inside a working tree that tracks nothing', async () => {
    const git = createGitTracking('');

    await expect(createTrackedFilesLister(git)()).resolves.toStrictEqual([]);
  });

  it('splits the listing on NUL and drops the trailing empty entry', async () => {
    const git = createGitTracking('src/index.ts\0src/check-utils/json.ts\0');

    await expect(createTrackedFilesLister(git)()).resolves.toStrictEqual(['src/index.ts', 'src/check-utils/json.ts']);
  });

  it('keeps the leading whitespace of the first path', async () => {
    const git = createGitTracking(' leading-space.txt\0normal.txt\0');

    await expect(createTrackedFilesLister(git)()).resolves.toStrictEqual([' leading-space.txt', 'normal.txt']);
  });

  it('lists untrimmed with `-z`, so git neither escapes nor quotes a path', async () => {
    const git = createGitTracking('src/index.ts\0');

    await createTrackedFilesLister(git)();

    expect(git.runGitRaw).toHaveBeenCalledWith(process.cwd(), 'ls-files', '-z');
  });

  it('invokes git once for calls that run concurrently', async () => {
    const git = createGitTracking('src/index.ts\0');
    const listTrackedFiles = createTrackedFilesLister(git);

    const [first, second] = await Promise.all([listTrackedFiles(), listTrackedFiles()]);

    expect(first).toStrictEqual(['src/index.ts']);
    expect(second).toStrictEqual(['src/index.ts']);
    expect(git.runGitRaw).toHaveBeenCalledTimes(1);
  });

  it('invokes git once for a later call, which reads the memoized listing', async () => {
    const git = createGitTracking('src/index.ts\0');
    const listTrackedFiles = createTrackedFilesLister(git);

    await listTrackedFiles();
    await listTrackedFiles();

    expect(git.runGitRaw).toHaveBeenCalledTimes(1);
  });

  it('does not memoize a rejected listing', async () => {
    const git = createGitTracking('src/index.ts\0');
    git.runGitRaw.mockRejectedValueOnce(new Error('fatal: unable to read index'));
    const listTrackedFiles = createTrackedFilesLister(git);

    await expect(listTrackedFiles()).rejects.toThrow('unable to read index');
    await expect(listTrackedFiles()).resolves.toStrictEqual(['src/index.ts']);
  });
});

// region | Helpers

/** Returns a fake git whose working tree tracks the paths in `listing`, a `ls-files -z` output. */
function createGitTracking(listing: string): FakeGit {
  return createFakeGit({ 'rev-parse --git-dir': '.git', 'ls-files': listing });
}

// endregion | Helpers
