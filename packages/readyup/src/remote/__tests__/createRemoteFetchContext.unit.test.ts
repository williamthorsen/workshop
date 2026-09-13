import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mockResolveBitbucketToken = vi.hoisted(() => vi.fn());
const mockResolveGitHubToken = vi.hoisted(() => vi.fn());

vi.mock(import('../resolveBitbucketToken.ts'), () => ({
  resolveBitbucketToken: mockResolveBitbucketToken,
}));

vi.mock(import('../resolveGitHubToken.ts'), () => ({
  resolveGitHubToken: mockResolveGitHubToken,
}));

import { createRemoteFetchContext } from '../createRemoteFetchContext.ts';

describe(createRemoteFetchContext, () => {
  afterEach(() => {
    mockResolveBitbucketToken.mockReset();
    mockResolveGitHubToken.mockReset();
  });

  it.each([false, true])('roots the cache in the resolved cache directory, with reload %s', (reload) => {
    const cacheHome = path.resolve('/var/cache-home');
    vi.stubEnv('XDG_CACHE_HOME', cacheHome);

    expect(createRemoteFetchContext({ reload }).cache).toStrictEqual({
      dir: path.join(cacheHome, 'readyup', 'http'),
      reload,
    });
  });

  it('has no cache when no cache directory can be resolved', () => {
    vi.stubEnv('XDG_CACHE_HOME', undefined);
    vi.stubEnv('HOME', undefined);
    vi.stubEnv('USERPROFILE', undefined);

    expect(createRemoteFetchContext({ reload: false }).cache).toBeUndefined();
  });

  it('resolves a provider\u{2019}s credential once however often its header is requested', () => {
    mockResolveGitHubToken.mockReturnValue('gh-secret');
    const context = createRemoteFetchContext({ reload: false });

    const firstHeaders = context.resolveAuthHeaders('github');
    const secondHeaders = context.resolveAuthHeaders('github');

    expect(mockResolveGitHubToken).toHaveBeenCalledTimes(1);
    expect(firstHeaders).toStrictEqual({ Authorization: 'token gh-secret' });
    expect(secondHeaders).toStrictEqual(firstHeaders);
  });

  it('remembers that a provider has no credential', () => {
    mockResolveGitHubToken.mockReturnValue(undefined);
    const context = createRemoteFetchContext({ reload: false });

    context.resolveAuthHeaders('github');

    expect(context.resolveAuthHeaders('github')).toBeUndefined();
    expect(mockResolveGitHubToken).toHaveBeenCalledTimes(1);
  });

  it('resolves each provider\u{2019}s credential separately', () => {
    mockResolveGitHubToken.mockReturnValue('gh-secret');
    mockResolveBitbucketToken.mockReturnValue('bb-secret');
    const context = createRemoteFetchContext({ reload: false });

    expect(context.resolveAuthHeaders('github')).toStrictEqual({ Authorization: 'token gh-secret' });
    expect(context.resolveAuthHeaders('bitbucket')).toStrictEqual({ Authorization: 'Bearer bb-secret' });
  });

  it('resolves a credential again in a new context', () => {
    mockResolveGitHubToken.mockReturnValue('gh-secret');

    createRemoteFetchContext({ reload: false }).resolveAuthHeaders('github');
    createRemoteFetchContext({ reload: false }).resolveAuthHeaders('github');

    expect(mockResolveGitHubToken).toHaveBeenCalledTimes(2);
  });
});
