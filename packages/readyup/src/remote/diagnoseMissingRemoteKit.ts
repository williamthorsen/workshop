import { kitLoadError, type RdyError } from '../errors/RdyError.ts';
import { formatRepositoryLabel, type RepositoryProvenance, toRepositorySource } from '../kits/KitProvenance.ts';
import type { RemoteFetchContext } from './createRemoteFetchContext.ts';
import { buildRepositoryManifestUrl } from './kitSourceUrls.ts';
import { loadRemoteManifest, RemoteManifestNotFoundError } from './loadRemoteManifest.ts';
import type { RemoteProvider } from './remote-provider.ts';
import type { RemoteFetchError } from './RemoteFetchError.ts';
import { buildMissingManifestHint } from './toRemoteRdyError.ts';

export interface MissingRemoteKit {
  /** The 404 that the kit fetch returned, attached as the cause of the diagnosis. */
  error: RemoteFetchError;

  kitName: string;
  kitUrl: string;
  provenance: RepositoryProvenance;
  provider: RemoteProvider | undefined;
  remote: RemoteFetchContext;

  /** Whether an `Authorization` header was actually sent with the kit fetch. */
  tokenForwarded: boolean;
}

/**
 * Explains a repository kit that returned 404 by reading the manifest that the repository publishes.
 *
 * Returns `undefined` when the manifest cannot be read for any reason other than its absence, so that the caller
 * reports the kit fetch as it failed rather than a diagnosis drawn from a broken manifest.
 */
export async function diagnoseMissingRemoteKit(missing: MissingRemoteKit): Promise<RdyError | undefined> {
  const { error, kitName, kitUrl, provenance, provider, remote, tokenForwarded } = missing;
  const label = formatRepositoryLabel(provenance);

  let manifest;
  try {
    manifest = await loadRemoteManifest({
      url: buildRepositoryManifestUrl(toRepositorySource(provenance)),
      cache: remote.cache,
      resolveHeaders: () => remote.resolveAuthHeaders(provider),
    });
  } catch (probeError: unknown) {
    if (!(probeError instanceof RemoteManifestNotFoundError)) return undefined;
    return kitLoadError(
      `Kit "${kitName}" not found at ${kitUrl}, and ${label} does not publish a manifest, ` +
        `so the repository or the ref "${provenance.ref}" may not exist.`,
      { cause: error, hint: buildMissingManifestHint({ provider, tokenForwarded }) },
    );
  }

  const published = manifest.kits.map((kit) => kit.name);

  if (published.includes(kitName)) {
    return kitLoadError(`The manifest of ${label} lists kit "${kitName}", but its bundle is missing at ${kitUrl}.`, {
      cause: error,
      hint: `Ask the publisher of ${label} to commit the bundle that \`rdy compile\` writes.`,
    });
  }

  const availability = published.length > 0 ? `Available kits: ${published.join(', ')}.` : 'Its manifest lists none.';
  return kitLoadError(`Kit "${kitName}" is not published by ${label}. ${availability}`, {
    cause: error,
    hint: `Run \`rdy list --from ${provenance.source}\` to see each kit's checklists.`,
  });
}
