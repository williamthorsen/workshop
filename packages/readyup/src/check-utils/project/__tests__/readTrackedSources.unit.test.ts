import { promisify } from 'node:util';

import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { useTempDir } from '../../../test-utils/tempDir.ts';
import { readTrackedSources } from '../readTrackedSources.ts';

const temp = useTempDir({ prefix: 'rdy-sources-', cwd: 'mock' });

describe(readTrackedSources, () => {
  beforeEach(() => {
    existsProbes.length = 0;
    readPaths.length = 0;
  });

  it('reads each file once across calls passing different filters', async () => {
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

  it('never reads a path the filter rejects', async () => {
    temp.write('src/kept.ts', 'kept');
    temp.write('src/rejected.ts', 'rejected');
    trackPaths('src/kept.ts', 'src/rejected.ts');

    await readTrackedSources((path) => path === 'src/kept.ts');

    expect(countReads('src/rejected.ts')).toBe(0);
    expect(countProbes('src/rejected.ts')).toBe(0);
  });

  it('never reads an excluded path, whatever the filter answers for it', async () => {
    temp.write('src/kept.ts', 'kept');
    temp.write('node_modules/dependency/index.js', 'dependency');
    temp.write('.readyup/kits/default.js', 'bundle');
    trackPaths('.readyup/kits/default.js', 'node_modules/dependency/index.js', 'src/kept.ts');

    const sources = await readTrackedSources(() => true);

    expect(sources).toStrictEqual([{ path: 'src/kept.ts', text: 'kept' }]);
    expect(countReads('node_modules/dependency/index.js')).toBe(0);
    expect(countReads('.readyup/kits/default.js')).toBe(0);
  });

  it('sweeps a kit source, which only its compiled bundle is excluded from', async () => {
    temp.write('.readyup/kits/default.ts', 'kit source');
    trackPaths('.readyup/kits/default.ts');

    await expect(readTrackedSources(() => true)).resolves.toStrictEqual([
      { path: '.readyup/kits/default.ts', text: 'kit source' },
    ]);
  });

  it('omits a tracked path that cannot be read, and probes the filesystem for it once', async () => {
    temp.write('src/present.ts', 'present');
    trackPaths('src/deleted.ts', 'src/present.ts');

    const first = await readTrackedSources();
    await readTrackedSources();

    expect(first).toStrictEqual([{ path: 'src/present.ts', text: 'present' }]);
    expect(countProbes('src/deleted.ts')).toBe(1);
  });

  it('omits a tracked path that resolves to a directory', async () => {
    temp.write('website/docs/page.md', 'page');
    temp.symlinkDir('docs', 'website/docs');
    temp.write('src/present.ts', 'present');
    trackPaths('docs', 'src/present.ts');

    await expect(readTrackedSources()).resolves.toStrictEqual([{ path: 'src/present.ts', text: 'present' }]);
    // The read is what tells a directory from a source, so a fixture git never listed would pass this vacuously.
    expect(countReads('docs')).toBe(1);
  });

  it('returns undefined outside a git working tree', async () => {
    temp.write('src/present.ts', 'present');
    execFileAsync.mockRejectedValue(Object.assign(new Error('fatal: not a git repository'), { code: 128 }));

    await expect(readTrackedSources()).resolves.toBeUndefined();
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

/** Answers the repo probe with a working tree, and the listing with the given paths. */
function trackPaths(...paths: string[]): void {
  execFileAsync.mockImplementation((_file, args) => {
    if (args.includes('rev-parse')) return Promise.resolve({ stdout: '.git\n', stderr: '' });
    return Promise.resolve({ stdout: `${paths.join('\0')}\0`, stderr: '' });
  });
}

// endregion | Helpers
