import { describeError } from '@williamthorsen/toolbelt.errors';

import { extractHint } from '../errors/error-handling.ts';
import { kitLoadError, type RdyError } from '../errors/RdyError.ts';
import { describeUnresolvableImports } from '../kitImports/describeUnresolvableImports.ts';
import { UnresolvableKitImportsError } from '../kitImports/UnresolvableKitImportsError.ts';
import { type LoadedRdyKit, loadRdyKit } from '../kits/loadRdyKit.ts';
import type { RemoteFetchContext } from '../remote/createRemoteFetchContext.ts';
import { diagnoseMissingRemoteKit } from '../remote/diagnoseMissingRemoteKit.ts';
import { loadRemoteKit } from '../remote/loadRemoteKit.ts';
import { resolveRemoteProvider } from '../remote/remote-provider.ts';
import { RemoteFetchError } from '../remote/RemoteFetchError.ts';
import { toRemoteRdyError } from '../remote/toRemoteRdyError.ts';
import type { ResolvedKitEntry } from './ResolvedKitEntry.ts';
import { assertSatisfiesVersionFloor } from './version-skew.ts';

/**
 * Loads a rdy kit from a path or URL source.
 *
 * Takes the whole entry rather than its source alone: A kit with readyup imports that the runner cannot satisfy
 * is reported with a remedy chosen from the kit's provenance, which the source by itself does not state.
 */
export async function loadKit(entry: ResolvedKitEntry, remote: RemoteFetchContext): Promise<LoadedRdyKit> {
  const loaded = await loadFromSource(entry, remote);

  // Check outside the load, whose catch blocks rewrap anything thrown inside them through
  // `describeError` and would drop the hint naming the upgrade.
  assertSatisfiesVersionFloor(entry.name, loaded.kit);

  return loaded;
}

// region | Helpers

/** Fetches or reads a kit from its source, reporting every failure as the kit-load error that a reader sees. */
async function loadFromSource(entry: ResolvedKitEntry, remote: RemoteFetchContext): Promise<LoadedRdyKit> {
  const { source } = entry;

  if ('url' in source) {
    const provider = resolveRemoteProvider(source.url);

    try {
      return await loadRemoteKit({
        url: source.url,
        cache: remote.cache,
        resolveHeaders: () => remote.resolveAuthHeaders(provider),
      });
    } catch (error: unknown) {
      // Catch ahead of the remote wrapper: A kit that fetched cleanly and binds symbols that the runner lacks
      // is a diagnosis about the kit, and reshaping it as a fetch failure would name the wrong thing.
      if (error instanceof UnresolvableKitImportsError) throw toUnresolvableImportsError(error, entry);

      const tokenForwarded = remote.resolveAuthHeaders(provider) !== undefined;
      if (error instanceof RemoteFetchError && error.status === 404 && entry.provenance?.kind === 'repository') {
        const diagnosis = await diagnoseMissingRemoteKit({
          error,
          kitName: entry.name,
          kitUrl: source.url,
          provenance: entry.provenance,
          provider,
          remote,
          tokenForwarded,
        });
        if (diagnosis !== undefined) throw diagnosis;
      }
      throw toRemoteRdyError(error, { code: 'kit-load', provider, tokenForwarded, url: source.url });
    }
  }

  try {
    return await loadRdyKit(source.path, entry.name);
  } catch (error: unknown) {
    if (error instanceof UnresolvableKitImportsError) throw toUnresolvableImportsError(error, entry);
    throw kitLoadError(describeError(error), { cause: error, hint: extractHint(error) });
  }
}

/** Turns unresolvable readyup imports into the kit-load failure seen by a reader, named for where the kit came from. */
function toUnresolvableImportsError(error: UnresolvableKitImportsError, entry: ResolvedKitEntry): RdyError {
  const { hint, message } = describeUnresolvableImports(error.findings, {
    kitName: entry.name,
    provenance: entry.provenance,
  });
  return kitLoadError(message, { cause: error, hint });
}

// endregion | Helpers
