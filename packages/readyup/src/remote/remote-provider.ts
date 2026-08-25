import { resolveBitbucketToken } from './resolveBitbucketToken.ts';
import { resolveGitHubToken } from './resolveGitHubToken.ts';

/** A remote host readyup knows how to authenticate against. */
export type RemoteProvider = 'bitbucket' | 'github';

/** Host each provider serves kit content from. */
const PROVIDER_HOSTS: Record<RemoteProvider, string> = {
  bitbucket: 'api.bitbucket.org',
  github: 'raw.githubusercontent.com',
};

/**
 * Builds the `Authorization` header for a provider, or `undefined` when none can be built.
 *
 * Absorbs the scheme difference between the two providers, so no caller spells out `token` against
 * `Bearer`. Returns `undefined` both for an unknown provider and for a known one with no ambient
 * token, which is the state a caller reports as "no credential was forwarded".
 */
export function resolveRemoteAuthHeaders(provider: RemoteProvider | undefined): Record<string, string> | undefined {
  if (provider === 'github') {
    const token = resolveGitHubToken();
    return token === undefined ? undefined : { Authorization: `token ${token}` };
  }

  if (provider === 'bitbucket') {
    const token = resolveBitbucketToken();
    return token === undefined ? undefined : { Authorization: `Bearer ${token}` };
  }

  return undefined;
}

/**
 * Names the provider serving a URL, or `undefined` for a host readyup does not authenticate.
 *
 * Matching the host rather than the `--from` scheme covers a `--url` aimed at a provider by
 * construction, so the two flags need no separate code path. The comparison is against the parsed
 * host, so a third-party URL with a provider's name elsewhere in it does not match.
 */
export function resolveRemoteProvider(url: string): RemoteProvider | undefined {
  const host = parseHost(url);
  if (host === PROVIDER_HOSTS.bitbucket) return 'bitbucket';
  if (host === PROVIDER_HOSTS.github) return 'github';
  return undefined;
}

// region | Helpers

/** Reads a URL's host, or `undefined` when the string does not parse as a URL. */
function parseHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

// endregion | Helpers
