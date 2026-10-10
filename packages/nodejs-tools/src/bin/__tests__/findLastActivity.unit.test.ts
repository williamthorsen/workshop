import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { findLastActivity } from '../findLastActivity.ts';

const OLD = new Date('2026-01-01T00:00:00Z');
const RECENT = new Date('2026-09-30T00:00:00Z');

describe(findLastActivity, () => {
  it('reads the index of the enclosing work tree from a monorepo package', () => {
    using tree = createTempTree({ 'repo/.git/index': '', 'repo/packages/a/package.json': '{}' });
    fs.utimesSync(tree.resolve('repo/.git/index'), RECENT, RECENT);
    fs.utimesSync(tree.resolve('repo/packages/a'), OLD, OLD);

    expect(findLastActivity(tree.resolve('repo/packages/a'))).toStrictEqual({
      source: tree.resolve('repo/.git/index'),
      time: RECENT.getTime(),
    });
  });

  it('ignores the directory mtime inside a work tree', () => {
    using tree = createTempTree({ 'repo/.git/index': '', 'repo/package.json': '{}' });
    fs.utimesSync(tree.resolve('repo/.git/index'), OLD, OLD);
    fs.utimesSync(tree.resolve('repo'), RECENT, RECENT);

    expect(findLastActivity(tree.resolve('repo')).time).toBe(OLD.getTime());
  });

  it('reads a linked worktree from its own index rather than the main checkout', () => {
    using tree = createTempTree({
      'main/.git/index': '',
      'main/.git/worktrees/feature/index': '',
      'feature/.git': '',
    });
    tree.write('feature/.git', `gitdir: ${tree.resolve('main/.git/worktrees/feature')}\n`);
    fs.utimesSync(tree.resolve('main/.git/index'), RECENT, RECENT);
    fs.utimesSync(tree.resolve('main/.git/worktrees/feature/index'), OLD, OLD);

    expect(findLastActivity(tree.resolve('feature'))).toStrictEqual({
      source: tree.resolve('main/.git/worktrees/feature/index'),
      time: OLD.getTime(),
    });
  });

  it('resolves a relative gitdir against the .git file', () => {
    using tree = createTempTree({
      'repo/.git/modules/sub/index': '',
      'repo/sub/.git': 'gitdir: ../.git/modules/sub\n',
    });

    expect(findLastActivity(tree.resolve('repo/sub')).source).toBe(tree.resolve('repo/.git/modules/sub/index'));
  });

  it('falls back to the directory mtime when the work tree has no index', () => {
    using tree = createTempTree({ 'repo/.git/HEAD': '' });
    fs.utimesSync(tree.resolve('repo'), RECENT, RECENT);

    expect(findLastActivity(tree.resolve('repo'))).toStrictEqual({
      source: tree.resolve('repo'),
      time: RECENT.getTime(),
    });
  });

  it('falls back to the directory mtime outside a work tree', () => {
    using tree = createTempTree({ 'project/package.json': '{}' });
    fs.utimesSync(tree.resolve('project'), OLD, OLD);

    expect(findLastActivity(tree.resolve('project'))).toStrictEqual({
      source: tree.resolve('project'),
      time: OLD.getTime(),
    });
  });
});
