import type { ProjectSource } from './readTrackedSources.ts';

/** Names a package and the exports whose calls count as adoption of it. */
export interface CountPackageUsageOptions {
  packageName: string;
  exportNames: readonly string[];
}

/**
 * Counts calls to a package's exports across a project's sources, counting none in a source that never imports it.
 *
 * The import is what separates adoption from a name collision. A project hand-rolling its own helper of the same
 * name calls it as often as an adopter calls the real one, and counting those would report the project as adopted in
 * the same breath as naming the clone it should retire.
 */
export function countPackageUsage(sources: readonly ProjectSource[], options: CountPackageUsageOptions): number {
  const { exportNames, packageName } = options;
  if (exportNames.length === 0) return 0;

  const callPattern = buildCallPattern(exportNames);
  const importPattern = buildImportPattern(packageName);

  let total = 0;
  for (const source of sources) {
    if (!importPattern.test(source.text)) continue;
    total += source.text.matchAll(callPattern).toArray().length;
  }

  return total;
}

// region | Helpers

/** Builds the pattern matching a call to any of the named exports. */
function buildCallPattern(exportNames: readonly string[]): RegExp {
  const names = exportNames.map((name) => RegExp.escape(name)).join('|');
  return new RegExp(String.raw`\b(?:${names})\s*\(`, 'g');
}

/** Builds the pattern matching an import of the package, from its root or any of its subpaths. */
function buildImportPattern(packageName: string): RegExp {
  const specifier = `${RegExp.escape(packageName)}(?:/[^'"]+)?`;
  return new RegExp(String.raw`(?:from|import\(|require\()\s*['"]${specifier}['"]`);
}

// endregion | Helpers
