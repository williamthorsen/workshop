import type { RdyManifest } from '../manifest/manifestSchema.ts';
import type { RemoteFetchContext } from './createRemoteFetchContext.ts';
import { loadRemoteManifest } from './loadRemoteManifest.ts';
import { resolveRemoteProvider } from './remote-provider.ts';
import { toRemoteRdyError } from './toRemoteRdyError.ts';

/**
 * Fetches the manifest that a remote kit source publishes, authenticating when the host is one that readyup knows.
 *
 * Throws a `config` error on failure, with the credential hint that `toRemoteRdyError` attaches when no token was sent.
 */
export async function loadRemoteSourceManifest(url: string, remote: RemoteFetchContext): Promise<RdyManifest> {
  const provider = resolveRemoteProvider(url);

  try {
    return await loadRemoteManifest({
      url,
      cache: remote.cache,
      resolveHeaders: () => remote.resolveAuthHeaders(provider),
    });
  } catch (error: unknown) {
    const tokenForwarded = remote.resolveAuthHeaders(provider) !== undefined;
    throw toRemoteRdyError(error, { code: 'config', provider, tokenForwarded, url });
  }
}
