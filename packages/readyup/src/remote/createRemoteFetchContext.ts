import type { HttpCacheSettings } from './fetchWithCache.ts';
import { type RemoteProvider, resolveRemoteAuthHeaders } from './remote-provider.ts';
import { resolveHttpCacheDir } from './resolveHttpCacheDir.ts';

/** What one command invocation holds for its remote fetches: the cache, and a credential resolver. */
export interface RemoteFetchContext {
  cache: HttpCacheSettings | undefined;

  /** Returns the `Authorization` header for a provider, as `resolveRemoteAuthHeaders` builds it. */
  resolveAuthHeaders(provider: RemoteProvider | undefined): Record<string, string> | undefined;
}

/**
 * Creates the context for one command invocation's remote fetches.
 *
 * The context resolves each provider's credential at most once, so a run fetching several kits from one provider
 * spawns `gh auth token` no more than once. The cache is absent where no cache directory can be resolved.
 */
export function createRemoteFetchContext({ reload }: { reload: boolean }): RemoteFetchContext {
  const cacheDir = resolveHttpCacheDir();
  const resolvedHeaders = new Map<RemoteProvider | undefined, Record<string, string> | undefined>();

  return {
    cache: cacheDir === undefined ? undefined : { dir: cacheDir, reload },
    resolveAuthHeaders(provider) {
      if (!resolvedHeaders.has(provider)) {
        resolvedHeaders.set(provider, resolveRemoteAuthHeaders(provider));
      }
      return resolvedHeaders.get(provider);
    },
  };
}
