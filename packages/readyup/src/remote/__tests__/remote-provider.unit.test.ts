import { afterEach, describe, expect, it, vi } from 'vitest';

const mockResolveBitbucketToken = vi.hoisted(() => vi.fn());
const mockResolveGitHubToken = vi.hoisted(() => vi.fn());

// `resolveGitHubToken` shells out to `gh auth token`, so an unmocked run would answer differently
// depending on whether the developer happens to be logged in.
vi.mock(import('../resolveBitbucketToken.ts'), () => ({
  resolveBitbucketToken: mockResolveBitbucketToken,
}));

vi.mock(import('../resolveGitHubToken.ts'), () => ({
  resolveGitHubToken: mockResolveGitHubToken,
}));

import { resolveRemoteAuthHeaders, resolveRemoteProvider } from '../remote-provider.ts';

describe(resolveRemoteProvider, () => {
  it.each([
    ['https://raw.githubusercontent.com/acme/kits/HEAD/.readyup/manifest.json', 'github'],
    ['https://api.bitbucket.org/2.0/repositories/acme/kits/src/main/.readyup/manifest.json', 'bitbucket'],
  ])('resolves %s to %s', (url, expected) => {
    expect(resolveRemoteProvider(url)).toBe(expected);
  });

  it.each([
    ['a third-party host', 'https://example.com/kits/default.js'],
    ['a provider name appearing outside the host', 'https://example.com/raw.githubusercontent.com/default.js'],
    ['a sibling host under the same domain', 'https://github.com/acme/kits/raw/HEAD/default.js'],
    ['a value that is not a URL', 'not-a-url'],
  ])('resolves %s to undefined', (_label, url) => {
    expect(resolveRemoteProvider(url)).toBeUndefined();
  });
});

describe(resolveRemoteAuthHeaders, () => {
  afterEach(() => {
    mockResolveBitbucketToken.mockReset();
    mockResolveGitHubToken.mockReset();
  });

  it('sends a GitHub token under the token scheme', () => {
    mockResolveGitHubToken.mockReturnValue('gh-secret');

    expect(resolveRemoteAuthHeaders('github')).toStrictEqual({ Authorization: 'token gh-secret' });
  });

  it('sends a Bitbucket token under the Bearer scheme', () => {
    mockResolveBitbucketToken.mockReturnValue('bb-secret');

    expect(resolveRemoteAuthHeaders('bitbucket')).toStrictEqual({ Authorization: 'Bearer bb-secret' });
  });

  it.each(['bitbucket', 'github'] as const)('returns undefined when %s has no ambient token', (provider) => {
    mockResolveBitbucketToken.mockReturnValue(undefined);
    mockResolveGitHubToken.mockReturnValue(undefined);

    expect(resolveRemoteAuthHeaders(provider)).toBeUndefined();
  });

  it('returns undefined for an unknown provider without consulting either token source', () => {
    expect(resolveRemoteAuthHeaders(undefined)).toBeUndefined();
    expect(mockResolveBitbucketToken).not.toHaveBeenCalled();
    expect(mockResolveGitHubToken).not.toHaveBeenCalled();
  });
});
