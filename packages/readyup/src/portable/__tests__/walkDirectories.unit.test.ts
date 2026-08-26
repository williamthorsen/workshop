import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test, vi } from 'vitest';

const mockReaddirSync = vi.hoisted(() => vi.fn());

// Only directory reads are intercepted; the temporary tree still writes through to disk.
vi.mock(import('node:fs'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, readdirSync: mockReaddirSync };
});

import { useFailingDirectoryRead } from '../../test-utils/useFailingDirectoryRead.ts';
import { walkDirectories } from '../walkDirectories.ts';

const it = test
  .extend(
    'temp',
    makeFixture(() =>
      createTempTree(
        {
          '.hidden/package.json': '{}',
          'deep/one/two/package.json': '{}',
          'docs/readme.md': '',
          'node_modules/dep/package.json': '{}',
          'package.json': '{}',
          'packages/a/.readyup/kits/default.ts': '',
          'packages/a/package.json': '{}',
          'packages/b/node_modules/dep/package.json': '{}',
          'packages/b/package.json': '{}',
        },
        { prefix: 'rdy-walk-' },
      ),
    ),
  )
  .extend('reads', { auto: true }, ({ temp }) => useFailingDirectoryRead(mockReaddirSync, temp.dir));

describe(walkDirectories, () => {
  it('yields every directory holding a match, root-relative and sorted', ({ temp }) => {
    const found = walkDirectories({ root: temp.dir, match: '**/package.json' });

    expect(found).toStrictEqual(['.', 'deep/one/two', 'packages/a', 'packages/b']);
  });

  it('yields the sweep root as "." when the root itself holds a match', ({ temp }) => {
    const found = walkDirectories({ root: temp.dir, match: 'package.json' });

    expect(found).toStrictEqual(['.']);
  });

  it('omits a directory whose entries match nothing', ({ temp }) => {
    const found = walkDirectories({ root: temp.dir, match: '**/package.json' });

    expect(found).not.toContain('docs');
    expect(found).not.toContain('packages');
  });

  it('yields a directory once however many of its entries match', ({ temp }) => {
    temp.write('twins/first.json', '{}');
    temp.write('twins/second.json', '{}');

    const found = walkDirectories({ root: temp.dir, match: 'twins/*.json' });

    expect(found).toStrictEqual(['twins']);
  });

  it('yields the union of what its globs match when `match` is a list', ({ temp }) => {
    const found = walkDirectories({ root: temp.dir, match: ['packages/*/package.json', 'deep/**/package.json'] });

    expect(found).toStrictEqual(['deep/one/two', 'packages/a', 'packages/b']);
  });

  it('yields the directory holding a matching directory, not the match itself', ({ temp }) => {
    const found = walkDirectories({ root: temp.dir, match: '**/.readyup', prune: [] });

    expect(found).toStrictEqual(['packages/a']);
  });

  it('prunes node_modules and dot-directories by default', ({ temp }) => {
    const found = walkDirectories({ root: temp.dir, match: '**/package.json' });

    expect(found).not.toContain('node_modules/dep');
    expect(found).not.toContain('packages/b/node_modules/dep');
    expect(found).not.toContain('.hidden');
  });

  it('honors custom prune globs in place of the defaults', ({ temp }) => {
    const found = walkDirectories({ root: temp.dir, match: '**/package.json', prune: ['**/packages'] });

    expect(found).toStrictEqual(['.', '.hidden', 'deep/one/two', 'node_modules/dep']);
  });

  it('descends no further than the depth cap', ({ temp }) => {
    const found = walkDirectories({ root: temp.dir, match: '**/package.json', maxDepth: 2 });

    expect(found).toStrictEqual(['.', 'packages/a', 'packages/b']);
  });

  it('reaches a directory the depth cap admits', ({ temp }) => {
    const found = walkDirectories({ root: temp.dir, match: '**/package.json', maxDepth: 3 });

    expect(found).toContain('deep/one/two');
  });

  it.for(['EACCES', 'ENOENT', 'EPERM'])('skips a directory it cannot read for a benign %s', (code, { reads, temp }) => {
    reads.failReadOf('packages/b', code);

    const found = walkDirectories({ root: temp.dir, match: '**/package.json' });

    expect(found).toStrictEqual(['.', 'deep/one/two', 'packages/a']);
  });

  it('returns an empty list for a root that does not exist', ({ temp }) => {
    const found = walkDirectories({ root: `${temp.dir}/absent`, match: '**/package.json' });

    expect(found).toStrictEqual([]);
  });

  it('rethrows a filesystem failure that is not benign', ({ reads, temp }) => {
    reads.failReadOf('packages/b', 'EMFILE');

    expect(() => walkDirectories({ root: temp.dir, match: '**/package.json' })).toThrow('read failed: EMFILE');
  });
});
