import { execFileSync } from 'node:child_process';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { listTrackedFiles } from '../git-clone.ts';
import { buildLargeListingTree, LARGE_LISTING_FILE_COUNT } from '../../test-utils/large-listing.ts';

describe(listTrackedFiles, () => {
  it('lists every tracked path of a clone whose listing exceeds 1 MiB', () => {
    using tree = createTempTree(buildLargeListingTree('clone'), { prefix: 'repo-tools-' });
    const cloneDir = tree.resolve('clone');
    execFileSync('git', ['-C', cloneDir, 'init', '--quiet']);
    execFileSync('git', ['-C', cloneDir, 'add', '.']);

    const tracked = listTrackedFiles(cloneDir);
    expect(Array.isArray(tracked) && tracked.length).toBe(LARGE_LISTING_FILE_COUNT);
  });

  it("returns git's reason for a directory that is not in a checkout", () => {
    using tree = createTempTree({ 'plain/file.txt': '' }, { prefix: 'repo-tools-' });
    expect(listTrackedFiles(tree.resolve('plain'))).toMatch(/^fatal: not a git repository/);
  });
});
