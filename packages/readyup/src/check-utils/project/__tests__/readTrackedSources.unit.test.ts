import { promisify } from 'node:util';

import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { existsProbes, readPaths } = vi.hoisted(() => {
  const existsProbes: string[] = [];
  const readPaths: string[] = [];
  return { existsProbes, readPaths };
});

const execFileAsync = vi.hoisted(() =>
  vi.fn<(file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>>(),
);

vi.mock('node:child_process', () => {
  const stub = Object.assign(vi.fn(), { [promisify.custom]: execFileAsync });
  return { execFile: stub };
});

// The modules under test bind their `node:fs` functions at import, so a spy on the namespace never reaches them.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: (...args: Parameters<typeof actual.existsSync>) => {
      existsProbes.push(String(args[0]));
      return actual.existsSync(...args);
    },
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      readPaths.push(String(args[0]));
      return actual.readFileSync(...args);
    },
  };
});

import { readSourceText, readTrackedSources } from '../readTrackedSources.ts';
import { withSweepRecorder } from '../sweepRecorder.ts';
import { createRecorder } from '../test-utils/sweep-recording.ts';

const it = test.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-sources-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

describe(readTrackedSources, () => {
  beforeEach(() => {
    existsProbes.length = 0;
    readPaths.length = 0;
  });

  it('reads each file once across calls passing different filters', async ({ temp }) => {
    temp.write('src/shared.ts', 'shared');
    temp.write('src/first.ts', 'first');
    temp.write('src/second.ts', 'second');
    trackPaths('src/first.ts', 'src/second.ts', 'src/shared.ts');

    const first = await readTrackedSources((path) => path !== 'src/second.ts');
    const second = await readTrackedSources((path) => path !== 'src/first.ts');

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

  it('never reads a path the filter rejects', async ({ temp }) => {
    temp.write('src/kept.ts', 'kept');
    temp.write('src/rejected.ts', 'rejected');
    trackPaths('src/kept.ts', 'src/rejected.ts');

    await readTrackedSources((path) => path === 'src/kept.ts');

    expect(countReads('src/rejected.ts')).toBe(0);
    expect(countProbes('src/rejected.ts')).toBe(0);
  });

  it('never reads an excluded path, whatever the filter returns for it', async ({ temp }) => {
    temp.write('src/kept.ts', 'kept');
    temp.write('node_modules/dependency/index.js', 'dependency');
    temp.write('.readyup/kits/default.js', 'bundle');
    trackPaths('.readyup/kits/default.js', 'node_modules/dependency/index.js', 'src/kept.ts');

    const sources = await readTrackedSources(() => true);

    expect(sources).toStrictEqual([{ path: 'src/kept.ts', text: 'kept' }]);
    expect(countReads('node_modules/dependency/index.js')).toBe(0);
    expect(countReads('.readyup/kits/default.js')).toBe(0);
  });

  it('sweeps a kit source, which only its compiled bundle is excluded from', async ({ temp }) => {
    temp.write('.readyup/kits/default.ts', 'kit source');
    trackPaths('.readyup/kits/default.ts');

    await expect(readTrackedSources(() => true)).resolves.toStrictEqual([
      { path: '.readyup/kits/default.ts', text: 'kit source' },
    ]);
  });

  it('omits a tracked path that cannot be read, and probes the filesystem for it once', async ({ temp }) => {
    temp.write('src/present.ts', 'present');
    trackPaths('src/deleted.ts', 'src/present.ts');

    const first = await readTrackedSources();
    await readTrackedSources();

    expect(first).toStrictEqual([{ path: 'src/present.ts', text: 'present' }]);
    expect(countProbes('src/deleted.ts')).toBe(1);
  });

  it('omits a tracked path that resolves to a directory', async ({ temp }) => {
    temp.write('website/docs/page.md', 'page');
    temp.symlink('docs', 'website/docs');
    temp.write('src/present.ts', 'present');
    trackPaths('docs', 'src/present.ts');

    await expect(readTrackedSources()).resolves.toStrictEqual([{ path: 'src/present.ts', text: 'present' }]);
    // The read is what tells a directory from a source, so a fixture git never listed would pass this vacuously.
    expect(countReads('docs')).toBe(1);
  });

  it('returns undefined outside a git working tree', async ({ temp }) => {
    temp.write('src/present.ts', 'present');
    execFileAsync.mockRejectedValue(Object.assign(new Error('fatal: not a git repository'), { code: 128 }));

    await expect(readTrackedSources()).resolves.toBeUndefined();
  });

  it('reports the paths it returns to the recorder in scope', async ({ temp }) => {
    temp.write('src/kept.ts', 'kept');
    temp.write('src/rejected.ts', 'rejected');
    trackPaths('src/kept.ts', 'src/rejected.ts');
    const { recorder, scanned } = createRecorder();

    await withSweepRecorder(recorder, () => readTrackedSources((path) => path === 'src/kept.ts'));

    expect(scanned).toStrictEqual([['src/kept.ts']]);
  });

  it('reports a path it could not read to nobody, that being a file no check examined', async ({ temp }) => {
    temp.write('src/present.ts', 'present');
    trackPaths('src/deleted.ts', 'src/present.ts');
    const { recorder, scanned } = createRecorder();

    await withSweepRecorder(recorder, () => readTrackedSources());

    expect(scanned).toStrictEqual([['src/present.ts']]);
  });

  it('reports a second sweep, which a check repeating one has examined the files of again', async ({ temp }) => {
    temp.write('src/kept.ts', 'kept');
    trackPaths('src/kept.ts');
    const { recorder, scanned } = createRecorder();

    await withSweepRecorder(recorder, async () => {
      await readTrackedSources();
      await readTrackedSources();
    });

    expect(scanned).toStrictEqual([['src/kept.ts'], ['src/kept.ts']]);
  });

  it('reports nothing outside a git working tree', async ({ temp }) => {
    temp.write('src/present.ts', 'present');
    execFileAsync.mockRejectedValue(Object.assign(new Error('fatal: not a git repository'), { code: 128 }));
    const { recorder, scanned } = createRecorder();

    await withSweepRecorder(recorder, () => readTrackedSources());

    expect(scanned).toStrictEqual([]);
  });
});

describe(readSourceText, () => {
  beforeEach(() => {
    existsProbes.length = 0;
    readPaths.length = 0;
  });

  it('returns the text a sweep read, reading the file no second time', async ({ temp }) => {
    temp.write('src/swept.ts', 'swept');
    trackPaths('src/swept.ts');
    await readTrackedSources();

    expect(readSourceText('src/swept.ts')).toBe('swept');
    expect(countReads('src/swept.ts')).toBe(1);
  });

  it('reads a path no sweep selected, and reads it once across calls', ({ temp }) => {
    temp.write('src/unswept.ts', 'unswept');

    expect(readSourceText('src/unswept.ts')).toBe('unswept');
    expect(readSourceText('src/unswept.ts')).toBe('unswept');
    expect(countReads('src/unswept.ts')).toBe(1);
  });

  it('reads a path a sweep excludes, since exclusion governs what a sweep goes looking at', ({ temp }) => {
    temp.write('node_modules/dependency/index.js', 'dependency');

    expect(readSourceText('node_modules/dependency/index.js')).toBe('dependency');
  });

  it('returns undefined for a path holding no text, and probes the filesystem for it once', () => {
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

// region | Helpers

/** Counts the filesystem existence probes made for a directory-relative path. */
function countProbes(relativePath: string): number {
  return existsProbes.filter((probed) => probed.endsWith(`/${relativePath}`)).length;
}

/** Counts the reads made of a directory-relative path. */
function countReads(relativePath: string): number {
  return readPaths.filter((read) => read.endsWith(`/${relativePath}`)).length;
}

/** Stubs the repo probe with a working tree, and the listing with the given paths. */
function trackPaths(...paths: string[]): void {
  execFileAsync.mockImplementation((_file, args) => {
    if (args.includes('rev-parse')) return Promise.resolve({ stdout: '.git\n', stderr: '' });
    return Promise.resolve({ stdout: `${paths.join('\0')}\0`, stderr: '' });
  });
}

// endregion | Helpers
