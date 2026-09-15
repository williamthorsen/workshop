import { blankComments, blankNonCode } from '../../portable/blankNonCode.ts';
import type { ProjectSource } from './readTrackedSources.ts';

/** Names a package and the exports whose uses count as adoption of it. */
export interface CountPackageUsageOptions {
  packageName: string;
  exportNames: readonly string[];
}

/**
 * Counts uses of a package's exports across a project's sources, counting none in a source that never imports it,
 * from its root or any of its subpaths.
 *
 * A use is a call (`name(`), a tagged template (`` name`…` ``), or a member access (`name.member`). A name that is
 * itself a member (`other.name(`) is not a use, so `Class.method(` counts once where both are exports, and another
 * object's method of the same name counts none. A function passed by name is not counted.
 *
 * The import separates adoption from a name collision. A project hand-rolling its own helper of the same
 * name calls it as often as an adopter calls the real one, and counting those would report the project as adopted in
 * the same breath as naming the clone that it should retire.
 *
 * The two patterns read two texts. The use scan reads a source with comments and literals blanked, so a use named
 * in prose is not counted as one made. The import test locates its match in a source with comments alone blanked,
 * because the specifier that it matches is itself a string literal that full blanking would erase, and then reads
 * the blanked text at that offset to tell an import that the source runs from one that it merely quotes.
 */
export function countPackageUsage(sources: readonly ProjectSource[], options: CountPackageUsageOptions): number {
  const { exportNames, packageName } = options;
  if (exportNames.length === 0) return 0;

  const usePattern = buildUsePattern(exportNames);
  const importPattern = buildImportPattern(packageName);

  let total = 0;
  for (const source of sources) {
    const readable = blankComments(source.text).matchAll(importPattern).toArray();
    if (readable.length === 0) continue;

    // Blanking the literals runs only for a source that names the package, which most do not.
    const code = blankNonCode(source.text);
    const importsPackage = readable.some((match) => isCode(code, match.index));
    if (!importsPackage) continue;

    total += code.matchAll(usePattern).toArray().length;
  }

  return total;
}

// region | Helpers

/** Builds the pattern matching an import of the package, from its root or any of its subpaths. */
function buildImportPattern(packageName: string): RegExp {
  const specifier = `${RegExp.escape(packageName)}(?:/[^'"]+)?`;
  return new RegExp(String.raw`(?:from|import\(|require\()\s*['"]${specifier}['"]`, 'g');
}

/** Builds the pattern matching a call, a tagged template, or a member access on any of the named exports. */
function buildUsePattern(exportNames: readonly string[]): RegExp {
  const names = exportNames.map((name) => RegExp.escape(name)).join('|');
  // The lookbehind rejects a name after a single `.`, which is a member of something else, and accepts one after the
  // `...` of a spread.
  return new RegExp(String.raw`\b(?<!(?<!\.)\.)(?:${names})\s*[(\`.]`, 'g');
}

/**
 * Reports whether the offset at which an import matched holds code rather than the text of a literal.
 *
 * A match begins at `from`, `import(`, or `require(`, which survives full blanking where the import runs and
 * blanks where the same words sit inside an outer string. The specifier blanks either way, so this offset is the
 * only thing separating an import from a source that quotes one.
 */
function isCode(code: string, offset: number): boolean {
  return code[offset] !== ' ';
}

// endregion | Helpers
