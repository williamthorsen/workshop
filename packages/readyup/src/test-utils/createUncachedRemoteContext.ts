import type { RemoteFetchContext } from '../remote/createRemoteFetchContext.ts';
import { resolveRemoteAuthHeaders } from '../remote/remote-provider.ts';

/** Returns a remote fetch context that uses no cache and resolves a credential on every call. */
export function createUncachedRemoteContext(): RemoteFetchContext {
  return { cache: undefined, resolveAuthHeaders: resolveRemoteAuthHeaders };
}
