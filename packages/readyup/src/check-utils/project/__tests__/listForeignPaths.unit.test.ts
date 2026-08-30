import { promisify } from 'node:util';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileAsync = vi.hoisted(() =>
  vi.fn<(file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>>(),
);

const runCheckAttr = vi.hoisted(() =>
  vi.fn<(input: string, args: readonly string[]) => { error?: Error; stdout?: string }>(),
);

// `execFileAsync` answers the promisified form `listTrackedFiles` uses; the stub answers the callback form
// `runGitWithInput` calls. `runCheckAttr` stands in for git, and is what this suite counts invocations against.
vi.mock('node:child_process', async () => {
  const { createExecFileStub } = await import('../../../test-utils/createExecFileStub.ts');
  const stub = createExecFileStub((input, args) => runCheckAttr(input, args));
  return { execFile: Object.assign(stub, { [promisify.custom]: execFileAsync }) };
});

vi.mock(import('node:fs'), () => ({
  existsSync: () => true,
}));

import { listForeignPaths } from '../listForeignPaths.ts';

describe(listForeignPaths, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Each test claims a `cwd` of its own, so the module's per-`cwd` memoization starts empty for every case.
    vi.spyOn(process, 'cwd').mockReturnValue(`/repo/${expect.getState().currentTestName}`);
    trackPaths('src/bundle.mjs', 'src/hand.ts');
    runCheckAttr.mockReturnValue({ stdout: declare({ 'src/bundle.mjs': 'true', 'src/hand.ts': 'unspecified' }) });
  });

  it('writes every tracked path to stdin, NUL-terminated, and asks about both attributes', async () => {
    await listForeignPaths();

    expect(runCheckAttr).toHaveBeenCalledWith('src/bundle.mjs\0src/hand.ts\0', [
      '-C',
      process.cwd(),
      'check-attr',
      '-z',
      '--stdin',
      'linguist-generated',
      'linguist-vendored',
    ]);
  });

  it('invokes git once for a later call, which reads the memoized set', async () => {
    await listForeignPaths();
    await listForeignPaths();

    expect(runCheckAttr).toHaveBeenCalledOnce();
  });

  it('invokes git once for calls that run concurrently', async () => {
    const [first, second] = await Promise.all([listForeignPaths(), listForeignPaths()]);

    expect(first).toStrictEqual(new Set(['src/bundle.mjs']));
    expect(second).toStrictEqual(new Set(['src/bundle.mjs']));
    expect(runCheckAttr).toHaveBeenCalledOnce();
  });

  it('does not memoize a rejected lookup', async () => {
    runCheckAttr.mockReturnValueOnce({ error: new Error('fatal: unable to read index') });

    await expect(listForeignPaths()).rejects.toThrow('unable to read index');

    await expect(listForeignPaths()).resolves.toStrictEqual(new Set(['src/bundle.mjs']));
  });

  it('invokes git for nothing when the working tree tracks no file', async () => {
    trackPaths();

    await expect(listForeignPaths()).resolves.toStrictEqual(new Set());
    expect(runCheckAttr).not.toHaveBeenCalled();
  });

  it('returns an empty set outside a git working tree, invoking git for nothing', async () => {
    execFileAsync.mockRejectedValue(Object.assign(new Error('fatal: not a git repository'), { code: 128 }));

    await expect(listForeignPaths()).resolves.toStrictEqual(new Set());
    expect(runCheckAttr).not.toHaveBeenCalled();
  });
});

// region | Helpers

/** Renders a `check-attr -z` response declaring the given `linguist-generated` value for each path. */
function declare(valuesByPath: Record<string, string>): string {
  return Object.entries(valuesByPath)
    .flatMap(([path, value]) => [
      `${path}\0linguist-generated\0${value}\0`,
      `${path}\0linguist-vendored\0unspecified\0`,
    ])
    .join('');
}

/** Stubs the repo probe with a working tree, and the tracked listing with the given paths. */
function trackPaths(...paths: string[]): void {
  execFileAsync.mockImplementation((_file, args) => {
    if (args.includes('rev-parse')) return Promise.resolve({ stdout: '.git\n', stderr: '' });
    return Promise.resolve({ stdout: paths.map((path) => `${path}\0`).join(''), stderr: '' });
  });
}

// endregion | Helpers
