import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { readCurrentBranch } from '../../git/git-clone.ts';
import { assertWritable } from '../registry.ts';

const FIXTURE = 'repos:\n  - name: alpha\n    path: ~/repos/alpha\n';

describe(assertWritable, () => {
  it('allows a file outside any git checkout', () => {
    using tree = createTempTree({}, { prefix: 'repo-tools-' });
    expect(assertWritable(tree.write('repos.yaml', FIXTURE), readCurrentBranch)).toBeUndefined();
  });

  it('allows a file in a checkout on another branch', () => {
    using tree = createTempTree({}, { prefix: 'repo-tools-' });
    const { dir } = tree;
    execFileSync('git', ['-C', dir, 'init', '--quiet', '--initial-branch', 'main']);
    expect(assertWritable(tree.write('repos.yaml', FIXTURE), readCurrentBranch)).toBeUndefined();
  });

  it('refuses a file reached through a link into a checkout on the live branch, naming --file', () => {
    using tree = createTempTree({}, { prefix: 'repo-tools-' });
    const { dir } = tree;
    const target = tree.write('live/repos.yaml', FIXTURE);
    execFileSync('git', ['-C', `${dir}/live`, 'init', '--quiet', '--initial-branch', 'live']);
    const link = `${dir}/repos.yaml`;
    fs.symlinkSync(target, link);
    const message = assertWritable(link, readCurrentBranch);
    expect(message).toContain(`resolves to ${target}`);
    expect(message).toContain('--file <branch worktree copy>');
  });
});
