import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { commitAll, runGit } from '../../../test-utils/scratch-git-repo.ts';
import { findTrackedPaths } from '../find-tracked-paths.ts';

describe(findTrackedPaths, () => {
  it('returns the pathspecs that match a tracked file, whatever its name, ignored or not', () => {
    using tree = createTempTree({
      '.gitignore': '/demos/*/output/\n',
      'demos/a/generated/captions.en.srt': 'captions',
      'demos/a/output/other.mp4': 'video',
    });
    runGit(tree.dir, 'init', '--quiet');
    runGit(tree.dir, 'add', '--force', 'demos');
    commitAll(tree.dir);

    const pathspecs = ['demos/a/output/', 'demos/a/generated/captions.*', 'demos/a/audio/'];

    expect(findTrackedPaths(tree.dir, pathspecs)).toStrictEqual(['demos/a/output/', 'demos/a/generated/captions.*']);
  });

  it('returns undefined outside a git work tree', () => {
    using tree = createTempTree({ 'file.txt': 'x' });

    expect(findTrackedPaths(tree.dir, ['demos/a/output/'])).toBeUndefined();
  });
});
