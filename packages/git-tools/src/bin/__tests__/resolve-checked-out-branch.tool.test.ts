import { spawnSync } from 'node:child_process';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { resolveCheckedOutBranch } from '../resolve-checked-out-branch.ts';

const BRANCH = '249_add-thor-git-cli';
const REMEDY = '\nPass a branch name explicitly.';

describe(resolveCheckedOutBranch, () => {
  it('returns the branch checked out in the directory', () => {
    using tree = createTempTree({});
    git(tree, 'init', `--initial-branch=${BRANCH}`);

    expect(resolveCheckedOutBranch(tree.dir)).toBe(BRANCH);
  });

  it('throws, naming the remedy, when HEAD is detached', () => {
    using tree = createTempTree({});
    git(tree, 'init', `--initial-branch=${BRANCH}`);
    git(
      tree,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--allow-empty',
      '--message=initial',
    );
    git(tree, 'checkout', '--detach');

    expect(() => resolveCheckedOutBranch(tree.dir)).toThrow(`HEAD names no branch.${REMEDY}`);
  });

  it("throws, naming git's cause and the remedy, outside a repository", () => {
    using tree = createTempTree({});

    expect(() => resolveCheckedOutBranch(tree.dir)).toThrow(
      /: fatal: not a git repository.*\nPass a branch name explicitly\.$/,
    );
  });
});

// region | Helpers

/** Runs git in the tree, failing the test when it exits non-zero. */
function git(tree: TempTree, ...args: string[]): void {
  const { status, stderr } = spawnSync('git', args, { cwd: tree.dir, encoding: 'utf8' });

  expect({ status, stderr: status === 0 ? '' : stderr }).toStrictEqual({ status: 0, stderr: '' });
}

// endregion | Helpers
