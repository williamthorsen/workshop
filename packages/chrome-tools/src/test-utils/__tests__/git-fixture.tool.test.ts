import { describe, expect, it } from 'vitest';

import { makeGitFixture, runGit } from '../git-fixture.ts';

describe(makeGitFixture, () => {
  it('checks out feature, without an upstream, in a clone whose origin has main', () => {
    const { clone, env, remote } = makeGitFixture();
    expect(runGit(['-C', clone, 'symbolic-ref', '--short', 'HEAD'], env)).toBe('feature');
    expect(runGit(['-C', clone, 'remote', 'get-url', 'origin'], env)).toBe(remote);
    expect(runGit(['-C', remote, 'branch', '--list'], env)).toBe('main');
    expect(() => runGit(['-C', clone, 'config', '--get', 'branch.feature.merge'], env)).toThrow(/failed/);
  });
});
