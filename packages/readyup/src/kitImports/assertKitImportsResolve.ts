import { listRunnerExports } from './listRunnerExports.ts';
import { scanReadyupImports } from './scanReadyupImports.ts';
import { type MissingImports, UnresolvableKitImportsError } from './UnresolvableKitImportsError.ts';

/**
 * Verifies that every readyup symbol a compiled bundle imports is one the running readyup exports.
 *
 * Runs before the bundle is evaluated, which is what lets a missing symbol be named. Evaluated first, it would
 * become an `undefined` binding under jiti's CJS transpilation, or a raw link error under a native import.
 *
 * Throws `UnresolvableKitImportsError` naming everything the runner cannot supply, so one failure reports the whole
 * gap rather than the first symbol of it.
 */
export async function assertKitImportsResolve(bundle: string, sourceName?: string): Promise<void> {
  const imports = await scanReadyupImports(bundle, sourceName);

  const unknownSubpaths = new Set<string>();
  const missingBySpecifier = new Map<string, Set<string>>();

  for (const entry of imports) {
    const exported = listRunnerExports(entry.specifier);
    if (exported === undefined) {
      unknownSubpaths.add(entry.specifier);
      continue;
    }
    for (const name of entry.names) {
      if (exported.has(name)) continue;
      // Collect by specifier: one specifier is imported from many times across a bundle's module sections.
      const collected = missingBySpecifier.get(entry.specifier) ?? new Set<string>();
      collected.add(name);
      missingBySpecifier.set(entry.specifier, collected);
    }
  }

  if (unknownSubpaths.size === 0 && missingBySpecifier.size === 0) return;

  throw new UnresolvableKitImportsError({
    unknownSubpaths: [...unknownSubpaths].toSorted(),
    missing: toSortedMissing(missingBySpecifier),
  });
}

// region | Helpers

/** Renders the collected misses in a stable order, so one gap always reports identically. */
function toSortedMissing(missingBySpecifier: Map<string, Set<string>>): MissingImports[] {
  return [...missingBySpecifier]
    .map(([specifier, names]): MissingImports => ({ specifier, names: [...names].toSorted() }))
    .toSorted((left, right) => left.specifier.localeCompare(right.specifier));
}

// endregion | Helpers
