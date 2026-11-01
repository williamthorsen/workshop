import { spawnSync } from 'node:child_process';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { readSourceState } from '../read-source-state.ts';

describe(readSourceState, () => {
  it('returns undefined outside a git work tree', () => {
    using tree = createTempTree({ 'file.txt': 'x' });

    expect(readSourceState(tree.dir)).toBeUndefined();
  });

  it('returns undefined in a repository without a commit', () => {
    using tree = createTempTree({ 'file.txt': 'x' });
    git(tree, 'init', '--quiet');

    expect(readSourceState(tree.dir)).toBeUndefined();
  });

  it('reports a clean work tree at its commit', () => {
    using tree = createCommittedRepo();

    expect(readSourceState(tree.dir)).toStrictEqual({ commit: git(tree, 'rev-parse', 'HEAD').trim(), dirty: false });
  });

  it('reports an untracked file as dirty', () => {
    using tree = createCommittedRepo();
    tree.write('new.txt', 'y');

    expect(readSourceState(tree.dir)?.dirty).toBe(true);
  });
});

// region | Helpers

/** Creates a repository whose one file is committed. */
function createCommittedRepo(): TempTree {
  const tree = createTempTree({ 'file.txt': 'x' });
  git(tree, 'init', '--quiet');
  git(tree, 'add', '.');
  git(tree, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '--message', 'init');

  return tree;
}

/** Runs git in the tree, failing the test when it exits non-zero, and returns its stdout. */
function git(tree: TempTree, ...args: string[]): string {
  const { status, stderr, stdout } = spawnSync('git', args, { cwd: tree.dir, encoding: 'utf8' });
  if (status !== 0) throw new Error(`git ${args.join(' ')} failed: ${stderr}`);

  return stdout;
}

// endregion | Helpers
