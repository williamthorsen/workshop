import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { commitAll, runGit } from '../../../test-utils/scratch-git-repo.ts';
import { readSourceState } from '../read-source-state.ts';

describe(readSourceState, () => {
  it('returns undefined outside a git work tree', () => {
    using tree = createTempTree({ 'file.txt': 'x' });

    expect(readSourceState(tree.dir)).toBeUndefined();
  });

  it('returns undefined in a repository without a commit', () => {
    using tree = createTempTree({ 'file.txt': 'x' });
    runGit(tree.dir, 'init', '--quiet');

    expect(readSourceState(tree.dir)).toBeUndefined();
  });

  it('reports a clean work tree at its commit', () => {
    using tree = createTempTree({ 'file.txt': 'x' });
    const commit = commitAll(tree.dir);

    expect(readSourceState(tree.dir)).toStrictEqual({ commit, dirty: false });
  });

  it('reports an untracked file as dirty', () => {
    using tree = createTempTree({ 'file.txt': 'x' });
    commitAll(tree.dir);
    tree.write('new.txt', 'y');

    expect(readSourceState(tree.dir)?.dirty).toBe(true);
  });
});
