import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { buildLargeListingTree, LARGE_LISTING_FILE_COUNT } from '../../test-utils/large-listing.ts';
import { listTrackedFiles, listWorktrees, repairWorktrees } from '../git-clone.ts';

describe(listTrackedFiles, () => {
  it('lists every tracked path of a clone whose listing exceeds 1 MiB', () => {
    using tree = createTempTree(buildLargeListingTree('clone'), { prefix: 'repo-tools-' });
    const cloneDir = tree.resolve('clone');
    execFileSync('git', ['-C', cloneDir, 'init', '--quiet']);
    execFileSync('git', ['-C', cloneDir, 'add', '.']);

    const tracked = listTrackedFiles(cloneDir);
    expect(tracked).toHaveLength(LARGE_LISTING_FILE_COUNT);
  });

  it("returns git's reason for a directory that is not in a checkout", () => {
    using tree = createTempTree({ 'plain/file.txt': '' }, { prefix: 'repo-tools-' });
    expect(listTrackedFiles(tree.resolve('plain'))).toMatch(/^fatal: not a git repository/);
  });
});

describe(listWorktrees, () => {
  it('lists the linked worktrees without the main one, marking a missing one prunable', () => {
    using tree = createTempTree({ 'app/README.md': '' }, { prefix: 'repo-tools-' });
    const primary = tree.resolve('app');
    initWithCommit(primary);
    git(primary, 'worktree', 'add', '--quiet', '-b', 'one', tree.resolve('app.one'));
    git(primary, 'worktree', 'add', '--quiet', '-b', 'two', tree.resolve('app.two'));
    fs.rmSync(tree.resolve('app.two'), { recursive: true });

    expect(listWorktrees(primary)).toStrictEqual([
      { isPrunable: false, path: fs.realpathSync(tree.resolve('app.one')) },
      { isPrunable: true, path: `${fs.realpathSync(tree.dir)}/app.two` },
    ]);
  });
});

describe(repairWorktrees, () => {
  it('restores git in a main worktree and a linked worktree that were both renamed', () => {
    using tree = createTempTree({ 'app/README.md': '' }, { prefix: 'repo-tools-' });
    initWithCommit(tree.resolve('app'));
    git(tree.resolve('app'), 'worktree', 'add', '--quiet', '-b', 'one', tree.resolve('app.one'));
    fs.renameSync(tree.resolve('app'), tree.resolve('moved'));
    fs.renameSync(tree.resolve('app.one'), tree.resolve('moved.one'));

    expect(repairWorktrees(tree.resolve('moved'), [tree.resolve('moved.one')])).toBeUndefined();
    expect(git(tree.resolve('moved'), 'status', '--short')).toBe('');
    expect(git(tree.resolve('moved.one'), 'status', '--short')).toBe('');
  });
});

// region | Helpers

/** Runs git in a directory and returns its stdout. */
function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Initializes a repository in a directory and commits its files. */
function initWithCommit(dir: string): void {
  git(dir, 'init', '--quiet', '--initial-branch', 'main');
  git(dir, 'add', '.');
  git(dir, '-c', 'user.name=spec', '-c', 'user.email=spec@example.com', 'commit', '--quiet', '-m', 'init');
}

// endregion | Helpers
