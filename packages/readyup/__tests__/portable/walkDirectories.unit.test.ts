import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReaddirSync = vi.hoisted(() => vi.fn());

// Only directory reads are intercepted; the temporary-directory helper still writes through to disk.
vi.mock(import('node:fs'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, readdirSync: mockReaddirSync };
});

import { walkDirectories } from '../../src/portable/walkDirectories.ts';
import { useTempDir } from '../helpers/tempDir.ts';

const { readdirSync: readdirSyncActual } = await vi.importActual<typeof import('node:fs')>('node:fs');

const tempDir = useTempDir({
  prefix: 'rdy-walk-',
  setup: () => {
    tempDir.write('package.json', '{}');
    tempDir.write('packages/a/package.json', '{}');
    tempDir.write('packages/a/.readyup/kits/default.ts', '');
    tempDir.write('packages/b/package.json', '{}');
    tempDir.write('packages/b/node_modules/dep/package.json', '{}');
    tempDir.write('.hidden/package.json', '{}');
    tempDir.write('node_modules/dep/package.json', '{}');
    tempDir.write('docs/readme.md', '');
    tempDir.write('deep/one/two/package.json', '{}');
  },
});

/** The read options the sweep passes, which a passthrough hands straight back to the real reader. */
type SweepReaddirOptions = { encoding: 'utf8'; withFileTypes: true };

/** Fails the directory at `relativePath`, letting every other read through to the filesystem. */
function failReadOf(relativePath: string, code: string): void {
  const failingDir = `${tempDir.dir}/${relativePath}`;
  mockReaddirSync.mockImplementation((dir: string, options: SweepReaddirOptions) => {
    if (dir === failingDir) throw Object.assign(new Error(`read failed: ${code}`), { code });
    return readdirSyncActual(dir, options);
  });
}

describe(walkDirectories, () => {
  beforeEach(() => {
    mockReaddirSync.mockImplementation(readdirSyncActual);
  });

  it('yields every directory holding a match, root-relative and sorted', () => {
    const found = walkDirectories({ root: tempDir.dir, match: '**/package.json' });

    expect(found).toStrictEqual(['.', 'deep/one/two', 'packages/a', 'packages/b']);
  });

  it('yields the sweep root as "." when the root itself holds a match', () => {
    const found = walkDirectories({ root: tempDir.dir, match: 'package.json' });

    expect(found).toStrictEqual(['.']);
  });

  it('omits a directory whose entries match nothing', () => {
    const found = walkDirectories({ root: tempDir.dir, match: '**/package.json' });

    expect(found).not.toContain('docs');
    expect(found).not.toContain('packages');
  });

  it('yields a directory once however many of its entries match', () => {
    tempDir.write('twins/first.json', '{}');
    tempDir.write('twins/second.json', '{}');

    const found = walkDirectories({ root: tempDir.dir, match: 'twins/*.json' });

    expect(found).toStrictEqual(['twins']);
  });

  it('yields the directory holding a matching directory, not the match itself', () => {
    const found = walkDirectories({ root: tempDir.dir, match: '**/.readyup', prune: [] });

    expect(found).toStrictEqual(['packages/a']);
  });

  it('prunes node_modules and dot-directories by default', () => {
    const found = walkDirectories({ root: tempDir.dir, match: '**/package.json' });

    expect(found).not.toContain('node_modules/dep');
    expect(found).not.toContain('packages/b/node_modules/dep');
    expect(found).not.toContain('.hidden');
  });

  // Pruning is the only thing that excludes anything, so a custom list reaches what the defaults hid.
  it('honors custom prune globs in place of the defaults', () => {
    const found = walkDirectories({ root: tempDir.dir, match: '**/package.json', prune: ['**/packages'] });

    expect(found).toStrictEqual(['.', '.hidden', 'deep/one/two', 'node_modules/dep']);
  });

  it('descends no further than the depth cap', () => {
    const found = walkDirectories({ root: tempDir.dir, match: '**/package.json', maxDepth: 2 });

    expect(found).toStrictEqual(['.', 'packages/a', 'packages/b']);
  });

  it('reaches a directory the depth cap admits', () => {
    const found = walkDirectories({ root: tempDir.dir, match: '**/package.json', maxDepth: 3 });

    expect(found).toContain('deep/one/two');
  });

  it.each(['EACCES', 'ENOENT', 'EPERM'])('skips a directory it cannot read for a benign %s', (code) => {
    failReadOf('packages/b', code);

    const found = walkDirectories({ root: tempDir.dir, match: '**/package.json' });

    expect(found).toStrictEqual(['.', 'deep/one/two', 'packages/a']);
  });

  it('returns nothing for a root that does not exist', () => {
    const found = walkDirectories({ root: `${tempDir.dir}/absent`, match: '**/package.json' });

    expect(found).toStrictEqual([]);
  });

  // An incomplete sweep must not pass for a complete one, so a systemic failure is not swallowed.
  it('rethrows a filesystem failure that is not benign', () => {
    failReadOf('packages/b', 'EMFILE');

    expect(() => walkDirectories({ root: tempDir.dir, match: '**/package.json' })).toThrow('read failed: EMFILE');
  });
});
