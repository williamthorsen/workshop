import { createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { beforeEach, describe, expect, it as baseIt, vi } from 'vitest';

const { readPaths, statProbes, unreadablePaths } = vi.hoisted(() => {
  const readPaths: string[] = [];
  const statProbes: string[] = [];
  const unreadablePaths = new Set<string>();
  return { readPaths, statProbes, unreadablePaths };
});

// The modules under test bind their `node:fs` functions at import, so a spy on the namespace never reaches them.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      const path = String(args[0]);
      readPaths.push(path);
      if ([...unreadablePaths].some((unreadable) => path.endsWith(`/${unreadable}`))) {
        throw Object.assign(new Error(`EACCES: permission denied, open '${path}'`), { code: 'EACCES' });
      }
      return actual.readFileSync(...args);
    },
    statSync: (...args: Parameters<typeof actual.statSync>) => {
      statProbes.push(String(args[0]));
      return actual.statSync(...args);
    },
  };
});

import { readSourceText, readTrackedSourcesWith } from '../readTrackedSources.ts';
import { withSweepRecorder } from '../sweepRecorder.ts';
import { createRecorder } from '../test-utils/sweep-recording.ts';

const foreignPaths = new Set<string>();

/** The tracked listing that the fake lister reports, `undefined` standing for a directory outside a working tree. */
const tracked: { paths: readonly string[] | undefined } = { paths: [] };

const listers = {
  listForeignPaths: () => Promise.resolve(new Set(foreignPaths)),
  listTrackedFiles: () => Promise.resolve(tracked.paths),
};

const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-sources-' })),
);

describe('readTrackedSources.ts', () => {
  it.aroundEach(async (runTest, { temp }) => {
    using _cwd = pointCwdAt(temp.dir);

    await runTest();
  });

  describe(readTrackedSourcesWith, () => {
    beforeEach(() => {
      foreignPaths.clear();
      tracked.paths = [];
      readPaths.length = 0;
      statProbes.length = 0;
      unreadablePaths.clear();
    });

    it('reads each file once across calls passing different filters', async ({ temp }) => {
      temp.write('src/shared.ts', 'shared');
      temp.write('src/first.ts', 'first');
      temp.write('src/second.ts', 'second');
      trackPaths('src/first.ts', 'src/second.ts', 'src/shared.ts');

      const first = await readTrackedSourcesWith(listers, (path) => path !== 'src/second.ts');
      const second = await readTrackedSourcesWith(listers, (path) => path !== 'src/first.ts');

      expect(first).toStrictEqual([
        { path: 'src/first.ts', text: 'first' },
        { path: 'src/shared.ts', text: 'shared' },
      ]);
      expect(second).toStrictEqual([
        { path: 'src/second.ts', text: 'second' },
        { path: 'src/shared.ts', text: 'shared' },
      ]);
      expect(countReads('src/shared.ts')).toBe(1);
      expect(countReads('src/first.ts')).toBe(1);
      expect(countReads('src/second.ts')).toBe(1);
    });

    it('reads a file once for two sweeps that run concurrently', async ({ temp }) => {
      temp.write('src/shared.ts', 'shared');
      temp.write('src/first.ts', 'first');
      temp.write('src/second.ts', 'second');
      trackPaths('src/first.ts', 'src/second.ts', 'src/shared.ts');

      // The cache's check-and-set runs without yielding, so whichever sweep reaches a path first is the only one that
      // reads it, however the two interleave.
      const [first, second] = await Promise.all([
        readTrackedSourcesWith(listers, (path) => path !== 'src/second.ts'),
        readTrackedSourcesWith(listers, (path) => path !== 'src/first.ts'),
      ]);

      expect(first).toStrictEqual([
        { path: 'src/first.ts', text: 'first' },
        { path: 'src/shared.ts', text: 'shared' },
      ]);
      expect(second).toStrictEqual([
        { path: 'src/second.ts', text: 'second' },
        { path: 'src/shared.ts', text: 'shared' },
      ]);
      expect(countReads('src/shared.ts')).toBe(1);
    });

    it('never reads a path rejected by the filter', async ({ temp }) => {
      temp.write('src/kept.ts', 'kept');
      temp.write('src/rejected.ts', 'rejected');
      trackPaths('src/kept.ts', 'src/rejected.ts');

      await readTrackedSourcesWith(listers, (path) => path === 'src/kept.ts');

      expect(countReads('src/rejected.ts')).toBe(0);
      expect(countProbes('src/rejected.ts')).toBe(0);
    });

    it('never reads an excluded path, whatever the filter returns for it', async ({ temp }) => {
      temp.write('src/kept.ts', 'kept');
      temp.write('node_modules/dependency/index.js', 'dependency');
      temp.write('.readyup/kits/default.js', 'bundle');
      trackPaths('.readyup/kits/default.js', 'node_modules/dependency/index.js', 'src/kept.ts');

      const sources = await readTrackedSourcesWith(listers, () => true);

      expect(sources).toStrictEqual([{ path: 'src/kept.ts', text: 'kept' }]);
      expect(countReads('node_modules/dependency/index.js')).toBe(0);
      expect(countReads('.readyup/kits/default.js')).toBe(0);
    });

    it('never reads a path that the project declares generated or vendored, whatever the filter returns for it', async ({
      temp,
    }) => {
      temp.write('src/hand.ts', 'hand-written');
      temp.write('bundles/skill.mjs', 'bundled');
      temp.write('vendor/jquery.js', 'vendored');
      trackPaths('bundles/skill.mjs', 'src/hand.ts', 'vendor/jquery.js');
      declareForeign('bundles/skill.mjs', 'vendor/jquery.js');

      const sources = await readTrackedSourcesWith(listers, () => true);

      expect(sources).toStrictEqual([{ path: 'src/hand.ts', text: 'hand-written' }]);
      expect(countReads('bundles/skill.mjs')).toBe(0);
      expect(countReads('vendor/jquery.js')).toBe(0);
    });

    it('reports a declared path to nobody, that being a file examined by no check', async ({ temp }) => {
      temp.write('src/hand.ts', 'hand-written');
      temp.write('bundles/skill.mjs', 'bundled');
      trackPaths('bundles/skill.mjs', 'src/hand.ts');
      declareForeign('bundles/skill.mjs');
      const { recorder, scanned } = createRecorder();

      await withSweepRecorder(recorder, () => readTrackedSourcesWith(listers));

      expect(scanned).toStrictEqual([['src/hand.ts']]);
    });

    it('sweeps a kit source, which only its compiled bundle is excluded from', async ({ temp }) => {
      temp.write('.readyup/kits/default.ts', 'kit source');
      trackPaths('.readyup/kits/default.ts');

      await expect(readTrackedSourcesWith(listers, () => true)).resolves.toStrictEqual([
        { path: '.readyup/kits/default.ts', text: 'kit source' },
      ]);
    });

    it('omits a tracked path that cannot be read, and probes the filesystem for it once', async ({ temp }) => {
      temp.write('src/present.ts', 'present');
      trackPaths('src/deleted.ts', 'src/present.ts');

      const first = await readTrackedSourcesWith(listers);
      await readTrackedSourcesWith(listers);

      expect(first).toStrictEqual([{ path: 'src/present.ts', text: 'present' }]);
      expect(countProbes('src/deleted.ts')).toBe(1);
    });

    it('omits a tracked file whose read fails, and returns the others', async ({ temp }) => {
      temp.write('src/locked.ts', 'locked');
      temp.write('src/present.ts', 'present');
      trackPaths('src/locked.ts', 'src/present.ts');
      unreadablePaths.add('src/locked.ts');

      await expect(readTrackedSourcesWith(listers)).resolves.toStrictEqual([
        { path: 'src/present.ts', text: 'present' },
      ]);
      expect(countReads('src/locked.ts')).toBe(1);
    });

    it('omits a tracked path that resolves to a directory', async ({ temp }) => {
      temp.write('website/docs/page.md', 'page');
      temp.symlink('docs', 'website/docs');
      temp.write('src/present.ts', 'present');
      trackPaths('docs', 'src/present.ts');

      await expect(readTrackedSourcesWith(listers)).resolves.toStrictEqual([
        { path: 'src/present.ts', text: 'present' },
      ]);
      // The probe tells a directory from a source, so a fixture never listed by git would pass this vacuously.
      expect(countProbes('docs')).toBe(1);
      expect(countReads('docs')).toBe(0);
    });

    it('returns undefined outside a git working tree', async ({ temp }) => {
      temp.write('src/present.ts', 'present');
      tracked.paths = undefined;

      await expect(readTrackedSourcesWith(listers)).resolves.toBeUndefined();
    });

    it('reports the paths that it returns to the recorder in scope', async ({ temp }) => {
      temp.write('src/kept.ts', 'kept');
      temp.write('src/rejected.ts', 'rejected');
      trackPaths('src/kept.ts', 'src/rejected.ts');
      const { recorder, scanned } = createRecorder();

      await withSweepRecorder(recorder, () => readTrackedSourcesWith(listers, (path) => path === 'src/kept.ts'));

      expect(scanned).toStrictEqual([['src/kept.ts']]);
    });

    it('reports a path that it could not read to nobody, that being a file examined by no check', async ({ temp }) => {
      temp.write('src/present.ts', 'present');
      trackPaths('src/deleted.ts', 'src/present.ts');
      const { recorder, scanned } = createRecorder();

      await withSweepRecorder(recorder, () => readTrackedSourcesWith(listers));

      expect(scanned).toStrictEqual([['src/present.ts']]);
    });

    it('reports a second sweep, which a check repeating one has examined the files of again', async ({ temp }) => {
      temp.write('src/kept.ts', 'kept');
      trackPaths('src/kept.ts');
      const { recorder, scanned } = createRecorder();

      await withSweepRecorder(recorder, async () => {
        await readTrackedSourcesWith(listers);
        await readTrackedSourcesWith(listers);
      });

      expect(scanned).toStrictEqual([['src/kept.ts'], ['src/kept.ts']]);
    });

    it('reports nothing to the recorder outside a git working tree', async ({ temp }) => {
      temp.write('src/present.ts', 'present');
      tracked.paths = undefined;
      const { recorder, scanned } = createRecorder();

      await withSweepRecorder(recorder, () => readTrackedSourcesWith(listers));

      expect(scanned).toStrictEqual([]);
    });
  });

  describe(readSourceText, () => {
    beforeEach(() => {
      foreignPaths.clear();
      tracked.paths = [];
      readPaths.length = 0;
      statProbes.length = 0;
      unreadablePaths.clear();
    });

    it('returns the text that a sweep read, reading the file no second time', async ({ temp }) => {
      temp.write('src/swept.ts', 'swept');
      trackPaths('src/swept.ts');
      await readTrackedSourcesWith(listers);

      expect(readSourceText('src/swept.ts')).toBe('swept');
      expect(countReads('src/swept.ts')).toBe(1);
    });

    it('reads a path selected by no sweep, and reads it once across calls', ({ temp }) => {
      temp.write('src/unswept.ts', 'unswept');

      expect(readSourceText('src/unswept.ts')).toBe('unswept');
      expect(readSourceText('src/unswept.ts')).toBe('unswept');
      expect(countReads('src/unswept.ts')).toBe(1);
    });

    it('reads a path excluded by a sweep, since exclusion governs what a sweep goes looking at', ({ temp }) => {
      temp.write('node_modules/dependency/index.js', 'dependency');

      expect(readSourceText('node_modules/dependency/index.js')).toBe('dependency');
    });

    it('returns undefined for a path that has no text, and probes the filesystem for it once', () => {
      expect(readSourceText('src/absent.ts')).toBeUndefined();
      expect(readSourceText('src/absent.ts')).toBeUndefined();
      expect(countProbes('src/absent.ts')).toBe(1);
    });

    it('reports nothing to the recorder in scope, a single read being no sweep', ({ temp }) => {
      temp.write('src/read.ts', 'read');
      const { recorder, scanned } = createRecorder();

      withSweepRecorder(recorder, () => readSourceText('src/read.ts'));

      expect(scanned).toStrictEqual([]);
    });
  });
});

// region | Helpers

/** Counts the filesystem stat probes made for a directory-relative path. */
function countProbes(relativePath: string): number {
  return statProbes.filter((probed) => probed.endsWith(`/${relativePath}`)).length;
}

/** Counts the reads made of a directory-relative path. */
function countReads(relativePath: string): number {
  return readPaths.filter((read) => read.endsWith(`/${relativePath}`)).length;
}

/** Declares the given paths generated, as a project's own `.gitattributes` would. */
function declareForeign(...paths: string[]): void {
  for (const path of paths) foreignPaths.add(path);
}

/** Sets the tracked listing to the given paths. */
function trackPaths(...paths: string[]): void {
  tracked.paths = paths;
}

// endregion | Helpers
