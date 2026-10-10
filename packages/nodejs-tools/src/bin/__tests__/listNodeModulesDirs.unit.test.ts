import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { listNodeModulesDirs } from '../listNodeModulesDirs.ts';

describe(listNodeModulesDirs, () => {
  it('lists every node_modules directory, sorted, without searching inside one', () => {
    using tree = createTempTree({
      'b/node_modules/pkg/node_modules/dep/index.js': '',
      'a/packages/x/node_modules/': '',
      'a/node_modules/': '',
      'c/src/': '',
    });

    expect(listNodeModulesDirs(tree.dir)).toStrictEqual([
      tree.resolve('a/node_modules'),
      tree.resolve('a/packages/x/node_modules'),
      tree.resolve('b/node_modules'),
    ]);
  });

  it('neither lists a symlinked node_modules nor follows a symlinked directory', () => {
    using tree = createTempTree({ 'elsewhere/node_modules/': '', 'project/src/': '' });
    tree.symlink('project/node_modules', tree.resolve('elsewhere/node_modules'));
    tree.symlink('linked', tree.resolve('elsewhere'));

    expect(listNodeModulesDirs(tree.resolve('project'))).toStrictEqual([]);
    expect(listNodeModulesDirs(tree.dir)).toStrictEqual([tree.resolve('elsewhere/node_modules')]);
  });

  it('does not search inside a .git directory', () => {
    using tree = createTempTree({ 'repo/.git/node_modules/': '' });

    expect(listNodeModulesDirs(tree.dir)).toStrictEqual([]);
  });

  it('passes an unreadable directory to onUnreadable and continues', () => {
    using tree = createTempTree({ 'locked/node_modules/': '', 'open/node_modules/': '' });
    fs.chmodSync(tree.resolve('locked'), 0o000);
    const unreadable: string[] = [];

    const found = listNodeModulesDirs(tree.dir, {
      onUnreadable: (dir) => {
        unreadable.push(dir);
      },
    });

    expect(found).toStrictEqual([tree.resolve('open/node_modules')]);
    expect(unreadable).toStrictEqual([tree.resolve('locked')]);
  });
});
