import { promisify } from 'node:util';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileAsync = vi.hoisted(() =>
  vi.fn<(file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>>(),
);

vi.mock('node:child_process', () => {
  const stub = Object.assign(vi.fn(), { [promisify.custom]: execFileAsync });
  return { execFile: stub };
});

vi.mock(import('node:fs'), () => ({
  existsSync: () => true,
}));

import { listTrackedFiles } from '../listTrackedFiles.ts';

describe(listTrackedFiles, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Each test claims a `cwd` of its own, so the module's per-`cwd` memoization starts empty for every case.
    vi.spyOn(process, 'cwd').mockReturnValue(`/repo/${expect.getState().currentTestName}`);
  });

  it('returns undefined outside a git working tree', async () => {
    respondWith({ isRepo: false });

    await expect(listTrackedFiles()).resolves.toBeUndefined();
  });

  it('returns an empty list inside a working tree that tracks nothing', async () => {
    respondWith({ trackedOutput: '' });

    await expect(listTrackedFiles()).resolves.toStrictEqual([]);
  });

  it('splits the listing on NUL and drops the trailing empty entry', async () => {
    respondWith({ trackedOutput: 'src/index.ts\0src/check-utils/json.ts\0' });

    await expect(listTrackedFiles()).resolves.toStrictEqual(['src/index.ts', 'src/check-utils/json.ts']);
  });

  it('keeps the leading whitespace of the first path', async () => {
    respondWith({ trackedOutput: ' leading-space.txt\0normal.txt\0' });

    await expect(listTrackedFiles()).resolves.toStrictEqual([' leading-space.txt', 'normal.txt']);
  });

  it('lists with `-z`, so git neither escapes nor quotes a path', async () => {
    respondWith({ trackedOutput: 'src/index.ts\0' });

    await listTrackedFiles();

    expect(execFileAsync).toHaveBeenCalledWith('git', ['-C', process.cwd(), 'ls-files', '-z']);
  });

  it('invokes git once for calls that run concurrently', async () => {
    respondWith({ trackedOutput: 'src/index.ts\0' });

    const [first, second] = await Promise.all([listTrackedFiles(), listTrackedFiles()]);

    expect(first).toStrictEqual(['src/index.ts']);
    expect(second).toStrictEqual(['src/index.ts']);
    expect(listInvocationCount()).toBe(1);
  });

  it('invokes git once for a later call, which reads the memoized listing', async () => {
    respondWith({ trackedOutput: 'src/index.ts\0' });

    await listTrackedFiles();
    await listTrackedFiles();

    expect(listInvocationCount()).toBe(1);
  });

  it('does not memoize a rejected listing', async () => {
    execFileAsync.mockImplementation((_file, args) => {
      if (args.includes('rev-parse')) return Promise.resolve({ stdout: '.git\n', stderr: '' });
      return Promise.reject(new Error('fatal: unable to read index'));
    });

    await expect(listTrackedFiles()).rejects.toThrow('unable to read index');

    respondWith({ trackedOutput: 'src/index.ts\0' });
    await expect(listTrackedFiles()).resolves.toStrictEqual(['src/index.ts']);
  });
});

// region | Helpers

/** Counts the `ls-files` invocations made so far, ignoring the repo probe that precedes each listing. */
function listInvocationCount(): number {
  return execFileAsync.mock.calls.filter(([, args]) => args.includes('ls-files')).length;
}

/** Stubs the repo probe and the listing that follows it, defaulting the probe to a working tree. */
function respondWith(options: { isRepo?: boolean; trackedOutput?: string }): void {
  const { isRepo = true, trackedOutput = '' } = options;
  execFileAsync.mockImplementation((_file, args) => {
    if (args.includes('rev-parse')) {
      return isRepo
        ? Promise.resolve({ stdout: '.git\n', stderr: '' })
        : Promise.reject(Object.assign(new Error('fatal: not a git repository'), { code: 128 }));
    }
    return Promise.resolve({ stdout: trackedOutput, stderr: '' });
  });
}

// endregion | Helpers
