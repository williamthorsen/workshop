import {
  countLeadingSpaces,
  findTopLevelKeyLine,
  isBlankOrComment,
  stripInlineComment,
  stripQuotes,
  UNSUPPORTED_SCALAR_LEADERS,
} from './yaml-line-scanners.ts';

/** The catalog named by a bare `catalog:` specifier, which pnpm documents the shorthand as expanding to. */
const DEFAULT_CATALOG_NAME = 'default';

/**
 * Reads the version that a pnpm catalog assigns to a package from `pnpm-workspace.yaml` content.
 * `catalogName` names the catalog to read, defaulting to the one to which `catalog:` expands.
 * Returns `undefined` when no catalog resolves the package, an entry that this reader cannot follow included;
 * it does not validate the rest of the file and never throws.
 */
export function findPnpmCatalogVersion(
  yaml: string,
  packageName: string,
  catalogName: string = DEFAULT_CATALOG_NAME,
): string | undefined {
  const lines = yaml.split(/\r?\n/);

  const blockLineIndex = findCatalogBlockLine(lines, catalogName);
  if (blockLineIndex === -1) return undefined;

  for (const entry of collectBlockEntries(lines, blockLineIndex)) {
    const mapping = parseMappingEntry(entry.text);
    if (mapping?.key === packageName) {
      return mapping.value === '' ? undefined : mapping.value;
    }
  }
  return undefined;
}

// region | Helpers

/**
 * Collects the entries of the block-mapping directly under a key line: the lines at the first indent
 * deeper than the key's. Blank lines, comments, and more deeply nested lines are skipped, and a line
 * indented no deeper than the key ends the block.
 */
function collectBlockEntries(lines: string[], keyLineIndex: number): { index: number; text: string }[] {
  const keyIndent = countLeadingSpaces(lines[keyLineIndex] ?? '');
  const entries: { index: number; text: string }[] = [];
  let childIndent: number | undefined;

  for (let index = keyLineIndex + 1; index < lines.length; index += 1) {
    const text = lines[index] ?? '';
    if (isBlankOrComment(text)) continue;

    const indent = countLeadingSpaces(text);
    if (indent <= keyIndent) break;

    childIndent ??= indent;
    if (indent === childIndent) entries.push({ index, text });
  }

  return entries;
}

/**
 * Finds the line opening a catalog's block. The default catalog is written as the top-level `catalog:`
 * key or as a `default` block under `catalogs:`, so both are tried for it. Returns -1 if absent.
 */
function findCatalogBlockLine(lines: string[], catalogName: string): number {
  if (catalogName === DEFAULT_CATALOG_NAME) {
    const topLevelLineIndex = findTopLevelKeyLine(lines, 'catalog');
    if (topLevelLineIndex !== -1) return topLevelLineIndex;
  }
  return findNamedCatalogLine(lines, catalogName);
}

/** Finds the line declaring `catalogName` under the top-level `catalogs:` key. Returns -1 if absent. */
function findNamedCatalogLine(lines: string[], catalogName: string): number {
  const catalogsLineIndex = findTopLevelKeyLine(lines, 'catalogs');
  if (catalogsLineIndex === -1) return -1;

  for (const entry of collectBlockEntries(lines, catalogsLineIndex)) {
    const mapping = parseMappingEntry(entry.text);
    // A named catalog opens a block of its own, so it declares a key and no value.
    if (mapping?.key === catalogName && mapping.value === '') return entry.index;
  }
  return -1;
}

/**
 * Splits a `key: value` mapping line into its parts, or returns `undefined` when the line is not one or
 * has a value that this reader cannot follow. The key may be quoted, as a scoped package name in a
 * catalog is; the value keeps any `:` that it contains, so a `workspace:*` entry survives.
 */
function parseMappingEntry(text: string): { key: string; value: string } | undefined {
  const match = /^(?:('[^']*')|("[^"]*")|([^:#]+?))\s*:(.*)$/.exec(text.trim());
  if (match === null) return undefined;

  // An indicator opens a construct rather than a scalar, and only on a plain value: A quoted one is text.
  const rawValue = stripInlineComment(match[4] ?? '').trim();
  if (UNSUPPORTED_SCALAR_LEADERS.has(rawValue.charAt(0))) return undefined;

  const rawKey = match[1] ?? match[2] ?? match[3] ?? '';
  return { key: stripQuotes(rawKey), value: stripQuotes(rawValue) };
}

// endregion | Helpers
