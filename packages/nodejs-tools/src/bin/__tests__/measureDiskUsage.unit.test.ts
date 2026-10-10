import fs from 'node:fs';
import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { measureDiskUsage } from '../measureDiskUsage.ts';

const CONTENTS = 'x'.repeat(65_536);

describe(measureDiskUsage, () => {
  it('sums the blocks allocated to every entry in the tree', () => {
    using tree = createTempTree({ 'nm/a.js': CONTENTS, 'nm/sub/b.js': CONTENTS });

    expect(measureDiskUsage(tree.resolve('nm'), new Set())).toBe(
      sumBlocks(tree.dir, ['nm', 'nm/a.js', 'nm/sub', 'nm/sub/b.js']),
    );
  });

  it('counts a hardlinked file once', () => {
    using tree = createTempTree({ 'nm/a.js': CONTENTS });
    const single = measureDiskUsage(tree.resolve('nm'), new Set());
    fs.linkSync(tree.resolve('nm/a.js'), tree.resolve('nm/b.js'));

    expect(measureDiskUsage(tree.resolve('nm'), new Set())).toBe(single);
  });

  it('does not count an inode already seen in the same run', () => {
    using tree = createTempTree({ 'one/a.js': CONTENTS, 'two/': '' });
    fs.linkSync(tree.resolve('one/a.js'), tree.resolve('two/a.js'));
    const seen = new Set<string>();
    measureDiskUsage(tree.resolve('one'), seen);

    expect(measureDiskUsage(tree.resolve('two'), seen)).toBe(sumBlocks(tree.dir, ['two']));
  });

  it('does not follow a symlink', () => {
    using tree = createTempTree({ 'big/a.js': CONTENTS, 'nm/': '' });
    const link = tree.symlink('nm/link', tree.resolve('big'));

    expect(measureDiskUsage(tree.resolve('nm'), new Set())).toBe(
      sumBlocks(tree.dir, ['nm']) + fs.lstatSync(link).blocks * 512,
    );
  });

  it('passes an unreadable directory to onUnreadable and counts the rest', () => {
    using tree = createTempTree({ 'nm/a.js': CONTENTS, 'nm/locked/b.js': CONTENTS });
    const expected = sumBlocks(tree.dir, ['nm', 'nm/a.js', 'nm/locked']);
    fs.chmodSync(tree.resolve('nm/locked'), 0o000);
    const unreadable: string[] = [];

    const total = measureDiskUsage(tree.resolve('nm'), new Set(), {
      onUnreadable: (entry) => {
        unreadable.push(entry);
      },
    });

    expect(total).toBe(expected);
    expect(unreadable).toStrictEqual([tree.resolve('nm/locked')]);
  });

  it('returns 0 for a path that does not exist', () => {
    using tree = createTempTree({});

    expect(measureDiskUsage(tree.resolve('absent'), new Set())).toBe(0);
  });
});

// region | Helpers

/** Sums the allocated bytes of the given tree-relative paths. */
function sumBlocks(root: string, paths: string[]): number {
  return paths.reduce((total, entry) => total + fs.lstatSync(path.join(root, entry)).blocks * 512, 0);
}

// endregion | Helpers
