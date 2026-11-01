import { describe, expect, it } from 'vitest';

import { parseRemoteUrl } from '../verb-run.ts';

describe(parseRemoteUrl, () => {
  it.each([
    ['git@github.com:owner/delta.git', 'github.com', 'owner/delta'],
    ['ssh://git@github.com/owner/delta.git', 'github.com', 'owner/delta'],
    ['ssh://git@example.com:7999/owner/delta.git', 'example.com', 'owner/delta'],
    ['https://github.com/owner/delta', 'github.com', 'owner/delta'],
    ['https://GitHub.com/owner/delta/', 'github.com', 'owner/delta'],
    ['https://u@bitbucket.org/ws/wthorsen-demos.git', 'bitbucket.org', 'ws/wthorsen-demos'],
    ['git@bitbucket.org:ws/wthorsen-demos.git', 'bitbucket.org', 'ws/wthorsen-demos'],
    ['https://gitlab.example.com/group/subgroup/delta.git', 'gitlab.example.com', 'subgroup/delta'],
  ])('reads %s', (url, host, path) => {
    expect(parseRemoteUrl(url)).toStrictEqual({ host, path });
  });

  it.each([['/srv/git/delta.git'], ['delta'], ['']])('returns undefined for %j', (url) => {
    expect(parseRemoteUrl(url)).toBeUndefined();
  });
});
