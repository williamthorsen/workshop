import { usageError } from '../errors/RdyError.ts';
import type { RemoteFetchContext } from '../remote/createRemoteFetchContext.ts';
import { expandConfiguredSources, type SourceKit } from '../sources/expandConfiguredSources.ts';
import type { ConfiguredSource } from '../sources/parseConfiguredSource.ts';
import { DEFAULT_KIT_NAME } from './defaultKitName.ts';
import type { ResolvedKitEntry } from './ResolvedKitEntry.ts';

/**
 * Resolves the requested kits, drawn from what the configured sources publish, into run entries.
 *
 * `requestedNames` is either the kit names to select or `'all'`, which selects every published kit source by
 * source, in configured order.
 *
 * An empty `sources` list is a usage error: The flag names a config key that the config does not have, so
 * the invocation asks for something that cannot be answered. Configured sources that publish no
 * requested kit are a different case and run nothing, which is the honest answer to "does this project
 * satisfy what these sources require of it" when they require nothing.
 */
export async function resolveConfiguredSources(
  configuredSources: readonly ConfiguredSource[],
  requestedNames: string[] | 'all',
  extension: string,
  remote: RemoteFetchContext,
): Promise<ResolvedKitEntry[]> {
  if (configuredSources.length === 0) {
    throw usageError('--sources requires a "sources" list in the readyup config; none is configured.');
  }

  const published = await expandConfiguredSources(configuredSources, extension, remote);
  const selected = requestedNames === 'all' ? published : selectRequestedKits(published, requestedNames);

  return selected.map((kit) => ({
    name: kit.kitName,
    source: kit.location,
    checklists: [],
    provenance: kit.provenance,
  }));
}

// region | Helpers

/**
 * Narrows what the configured sources publish to the requested kits, name-major.
 *
 * A configured source not publishing a requested kit is skipped rather than reported: `--sources`
 * asks whether this project satisfies what its configured sources require of it, and a source
 * requiring nothing under that name asks nothing of it.
 *
 * Name-major so that `--sources a b` runs every source's `a` before any source's `b`, matching the
 * order in which `rdy run a b` runs them against a single source.
 */
function selectRequestedKits(published: SourceKit[], requestedNames: string[]): SourceKit[] {
  return requestedNames.flatMap((kitName) => {
    const selected = published.filter((kit) => kit.kitName === kitName);
    if (selected.length === 0 && kitName !== DEFAULT_KIT_NAME) {
      const available = [...new Set(published.map((kit) => kit.kitName))].join(', ');
      throw usageError(`No configured source publishes a kit named "${kitName}"; available kits: ${available}.`);
    }
    return selected;
  });
}

// endregion | Helpers
