import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { commitAll, runGit } from '../../../test-utils/scratch-git-repo.ts';
import { findUnignoredPaths } from '../find-unignored-paths.ts';

describe(findUnignoredPaths, () => {
  it('returns the paths that the ignore rules leave uncovered, absent files under an ignored directory excepted', () => {
    using tree = createTempTree({ '.gitignore': '/demos/*/audio/\n/demos/*/.chrome-profile-fresh/\n' });
    runGit(tree.dir, 'init', '--quiet');

    const paths = ['demos/a/audio/voice.json', 'demos/a/.chrome-profile-fresh/Local State', 'demos/a/logs/render.log'];

    expect(findUnignoredPaths(tree.dir, paths)).toStrictEqual(['demos/a/logs/render.log']);
  });

  it('reports a tracked file that a pattern would otherwise ignore', () => {
    using tree = createTempTree({ '.gitignore': '/demos/*/output/\n', 'demos/a/output/final-demo.mp4': 'video' });
    runGit(tree.dir, 'init', '--quiet');
    runGit(tree.dir, 'add', '--force', 'demos/a/output/final-demo.mp4');
    commitAll(tree.dir);

    expect(findUnignoredPaths(tree.dir, ['demos/a/output/final-demo.mp4', 'demos/a/output/other.mp4'])).toStrictEqual([
      'demos/a/output/final-demo.mp4',
    ]);
  });

  it('returns every path when none is ignored', () => {
    using tree = createTempTree({ 'file.txt': 'x' });
    runGit(tree.dir, 'init', '--quiet');

    expect(findUnignoredPaths(tree.dir, ['demos/a/logs/render.log'])).toStrictEqual(['demos/a/logs/render.log']);
  });

  it('returns undefined outside a git work tree', () => {
    using tree = createTempTree({ 'file.txt': 'x' });

    expect(findUnignoredPaths(tree.dir, ['demos/a/logs/render.log'])).toBeUndefined();
  });
});
