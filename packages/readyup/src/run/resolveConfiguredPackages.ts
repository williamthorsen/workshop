import { usageError } from '../errors/RdyError.ts';
import { expandConfiguredPackages, type PackageKit } from '../installed-packages/expandConfiguredPackages.ts';
import { DEFAULT_KIT_NAME } from './defaultKitName.ts';
import type { ResolvedKitEntry } from './ResolvedKitEntry.ts';

/**
 * Resolves the requested kits, drawn from what the configured packages publish, into run entries.
 *
 * An empty `packages` list is a usage error: the flag names a config key the config does not have, so
 * the invocation asks for something that cannot be answered. Configured packages that publish no
 * requested kit are a different case and run nothing, which is the honest answer to "does this project
 * satisfy what these packages require of it" when they require nothing.
 */
export function resolveConfiguredPackages(
  configuredPackages: string[],
  requestedNames: string[],
  extension: string,
): ResolvedKitEntry[] {
  if (configuredPackages.length === 0) {
    throw usageError('--packages requires a "packages" list in the readyup config; none is configured.');
  }

  const published = expandConfiguredPackages(configuredPackages, extension);

  return selectRequestedKits(published, requestedNames).map((kit) => ({
    name: kit.kitName,
    source: { path: kit.path },
    checklists: [],
    provenance: { kind: 'package', packageName: kit.packageName, version: kit.version },
  }));
}

// region | Helpers

/**
 * Narrows what the configured packages publish to the requested kits, name-major.
 *
 * A configured package not publishing a requested kit is skipped rather than reported: `--packages`
 * asks whether this project satisfies what its configured packages require of it, and a package
 * requiring nothing under that name asks nothing of it.
 *
 * Name-major so `--packages a b` runs every package's `a` before any package's `b`, matching the
 * order `rdy run a b` runs them in against a single source.
 */
function selectRequestedKits(published: PackageKit[], requestedNames: string[]): PackageKit[] {
  return requestedNames.flatMap((kitName) => {
    const selected = published.filter((kit) => kit.kitName === kitName);
    if (selected.length === 0 && kitName !== DEFAULT_KIT_NAME) {
      const available = [...new Set(published.map((kit) => kit.kitName))].join(', ');
      throw usageError(`No configured package publishes a kit named "${kitName}"; available kits: ${available}.`);
    }
    return selected;
  });
}

// endregion | Helpers
