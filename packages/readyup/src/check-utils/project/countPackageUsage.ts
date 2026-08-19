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
 * in prose is not counted as one made. The import test locates its match in a source with comments alone blanked,
 * because the specifier it matches is itself a string literal that full blanking would erase, and then reads the
 * blanked text at that offset to tell an import the source runs from one it merely quotes.
 */
export function countPackageUsage(sources: readonly ProjectSource[], options: CountPackageUsageOptions): number {
  const { exportNames, packageName } = options;
  if (exportNames.length === 0) return 0;

  const callPattern = buildCallPattern(exportNames);
  const importPattern = buildImportPattern(packageName);

  let total = 0;
  for (const source of sources) {
    const readable = blankComments(source.text).matchAll(importPattern).toArray();
    if (readable.length === 0) continue;

    // Blanking the literals is paid for only by a source that names the package, which most do not.
    const code = blankNonCode(source.text);
    const importsPackage = readable.some((match) => isCode(code, match.index));
    if (!importsPackage) continue;

    total += code.matchAll(callPattern).toArray().length;
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
  return new RegExp(String.raw`(?:from|import\(|require\()\s*['"]${specifier}['"]`, 'g');
}

/**
 * Reports whether the offset an import matched at holds code rather than the text of a literal.
 *
 * A match begins at `from`, `import(`, or `require(`, which survives full blanking where the import runs and
 * blanks where the same words sit inside an outer string. The specifier blanks either way, so this offset is the
 * only thing separating an import from a source that quotes one.
 */
function isCode(code: string, offset: number): boolean {
  return code[offset] !== ' ';
}

// endregion | Helpers
