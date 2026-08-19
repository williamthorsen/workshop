import { blankComments, blankNonCode } from '../../portable/blankNonCode.ts';
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
 *
 * The two patterns read two texts. The call scan reads a source with comments and literals blanked, so a call named
 * in prose is not counted as one made. The import test reads a source with comments alone blanked, because the
 * specifier it matches is itself a string literal: blanking the literals too would leave it nothing to match, and
 * the function would count nothing at all.
 */
export function countPackageUsage(sources: readonly ProjectSource[], options: CountPackageUsageOptions): number {
  const { exportNames, packageName } = options;
  if (exportNames.length === 0) return 0;

  const callPattern = buildCallPattern(exportNames);
  const importPattern = buildImportPattern(packageName);

  let total = 0;
  for (const source of sources) {
    // Blanking the literals is paid for only by a source that imports the package, which most do not.
    if (!importPattern.test(blankComments(source.text))) continue;
    total += blankNonCode(source.text).matchAll(callPattern).toArray().length;
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
