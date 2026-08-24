import { readFileSync } from 'node:fs';

/**
 * Leading characters that mark a plain scalar as opening an unsupported YAML feature, mapped to the
 * feature name reported for each. A feature with two spellings appears once per character.
 */
const UNSUPPORTED_SCALAR_LEADERS = new Map([
  ['&', 'anchor (&name)'],
  ['*', 'alias (*name)'],
  ['[', 'flow sequence or mapping'],
  ['{', 'flow sequence or mapping'],
  ['|', 'block scalar (| or >)'],
  ['>', 'block scalar (| or >)'],
]);

/** The catalog a bare `catalog:` specifier names, which pnpm documents the shorthand as expanding to. */
const DEFAULT_CATALOG_NAME = 'default';

/**
 * Reads the version a pnpm catalog assigns to a package from `pnpm-workspace.yaml` content.
 * `catalogName` names the catalog to read, defaulting to the one `catalog:` expands to.
 * Returns `undefined` when no catalog resolves the package, an entry this reader cannot follow included.
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

/**
 * Read the `packages` block-sequence from a `pnpm-workspace.yaml` file.
 * Returns the list of pattern strings, or `null` when the `packages` key is absent.
 * Throws on YAML features outside the supported subset (anchors, flow sequences,
 * tags, negation patterns, etc.) with a pathful, line-pointing error.
 */
export function readPnpmWorkspacePackages(absolutePath: string): string[] | null {
  const content = readFileSync(absolutePath, 'utf8');
  const lines = content.split(/\r?\n/);

  rejectGlobalUnsupportedFeatures(absolutePath, lines);

  const packagesLineIndex = findTopLevelKeyLine(lines, 'packages');
  if (packagesLineIndex === -1) return null;

  const packagesLine = lines[packagesLineIndex] ?? '';
  const inlineValue = extractInlineValue(packagesLine);

  if (inlineValue !== null && inlineValue.length > 0) {
    throwUnsupported(absolutePath, packagesLineIndex, packagesLine, 'non-list value for `packages:`');
  }

  return collectSequenceItems(absolutePath, lines, packagesLineIndex);
}

// region | Helpers

/** Reject whole-file features (multi-document streams, anchors/aliases/tags appearing anywhere). */
function rejectGlobalUnsupportedFeatures(absolutePath: string, lines: string[]): void {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();
    if (trimmed === '---' || trimmed === '...') {
      throwUnsupported(absolutePath, index, line, 'multi-document stream marker');
    }
  }
}

/** Finds the line containing a named top-level key. Returns -1 if absent. */
function findTopLevelKeyLine(lines: string[], key: string): number {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (isBlankOrComment(line)) continue;
    // Top-level keys start at column 0 (no leading whitespace).
    if (/^\s/.test(line)) continue;
    const match = /^([A-Za-z_][\w-]*)\s*:(.*)$/.exec(line);
    if (match === null) continue;
    if (match[1] === key) return index;
  }
  return -1;
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
 * Splits a `key: value` mapping line into its parts, or returns undefined when the line is not one or
 * carries a value this reader cannot follow. The key may be quoted, as a scoped package name in a
 * catalog is; the value keeps any `:` it carries, so a `workspace:*` entry survives.
 */
function parseMappingEntry(text: string): { key: string; value: string } | undefined {
  const match = /^(?:('[^']*')|("[^"]*")|([^:#]+?))\s*:(.*)$/.exec(text.trim());
  if (match === null) return undefined;

  // An indicator opens a construct rather than a scalar, and only on a plain value: a quoted one is text.
  const rawValue = stripInlineComment(match[4] ?? '').trim();
  if (UNSUPPORTED_SCALAR_LEADERS.has(rawValue.charAt(0))) return undefined;

  const rawKey = match[1] ?? match[2] ?? match[3] ?? '';
  return { key: stripQuotes(rawKey), value: stripQuotes(rawValue) };
}

/** Return the trimmed value after a `key:` on the same line, or null if there's no inline value. */
function extractInlineValue(line: string): string | null {
  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) return null;
  const rest = line.slice(colonIndex + 1);
  const commentStripped = stripInlineComment(rest);
  const trimmed = commentStripped.trim();
  return trimmed;
}

/** Collect block-sequence items below the `packages:` line. */
function collectSequenceItems(absolutePath: string, lines: string[], packagesLineIndex: number): string[] {
  const items: string[] = [];
  let sequenceIndent: number | null = null;

  for (let index = packagesLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (isBlankOrComment(line)) continue;

    const leadingSpaces = countLeadingSpaces(line);

    // A new top-level key (no leading whitespace) ends the sequence.
    if (leadingSpaces === 0) break;

    // Lines inside the sequence must be list items (start with `-`).
    const trimmed = line.slice(leadingSpaces);
    if (!trimmed.startsWith('-')) {
      throwUnsupported(absolutePath, index, line, 'non-list value for `packages:`');
    }

    if (sequenceIndent === null) {
      sequenceIndent = leadingSpaces;
    } else if (leadingSpaces !== sequenceIndent) {
      throwUnsupported(absolutePath, index, line, 'inconsistent indentation in `packages:` sequence');
    }

    const afterDash = trimmed.slice(1);
    rejectItemLevelUnsupportedFeatures(absolutePath, index, line, afterDash);

    const rawValue = afterDash.replace(/^\s*/, '');
    const withoutComment = stripInlineComment(rawValue).trimEnd();

    if (withoutComment === '') {
      throwUnsupported(absolutePath, index, line, 'empty sequence item or nested structure');
    }

    const value = unquote(withoutComment, absolutePath, index, line);

    if (value.startsWith('!')) {
      throwNegationUnsupported(absolutePath, index, line, value);
    }

    items.push(value);
  }

  return items;
}

/** Reject per-item unsupported YAML features before quote-stripping. */
function rejectItemLevelUnsupportedFeatures(
  absolutePath: string,
  lineIndex: number,
  line: string,
  after: string,
): void {
  const trimmed = after.replace(/^\s*/, '');
  if (trimmed === '') return;

  const feature = UNSUPPORTED_SCALAR_LEADERS.get(trimmed.charAt(0));
  if (feature !== undefined) {
    throwUnsupported(absolutePath, lineIndex, line, feature);
  }

  // `!!tag` (e.g., `!!str`) is a YAML verbatim tag; always unsupported.
  // A single-`!` prefix on a plain (unquoted) scalar is treated as a negation pattern
  // (e.g., `!packages/deprecated/*`) and is handled downstream after unquoting.
  if (trimmed.startsWith('!!')) {
    throwUnsupported(absolutePath, lineIndex, line, 'YAML tag');
  }
}

/** Strips outer quotes from a sequence-item value, rejecting an unterminated one. Does not interpret escapes. */
function unquote(value: string, absolutePath: string, lineIndex: number, line: string): string {
  const stripped = stripQuotes(value);
  if (stripped === value && (value.startsWith("'") || value.startsWith('"'))) {
    throwUnsupported(absolutePath, lineIndex, line, 'unterminated quoted scalar');
  }
  return stripped;
}

/** Strips matching outer quotes from a scalar, leaving an unquoted or unterminated one as it is. */
function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    if ((first === "'" || first === '"') && value.at(-1) === first) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Strip an inline `#` comment, respecting single- and double-quoted scalars so a `#`
 * inside quotes is treated as part of the value.
 */
function stripInlineComment(text: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (!inDouble && char === "'") {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && char === '"') {
      inDouble = !inDouble;
      continue;
    }
    // A comment must be preceded by whitespace (or be at column 0 of the input slice).
    if (!inSingle && !inDouble && char === '#' && (index === 0 || /\s/.test(text[index - 1] ?? ''))) {
      return text.slice(0, index);
    }
  }
  return text;
}

/** True if a line is blank or a full-line comment. */
function isBlankOrComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === '' || trimmed.startsWith('#');
}

/** Count leading space characters on a line. */
function countLeadingSpaces(line: string): number {
  let count = 0;
  while (count < line.length && line[count] === ' ') count += 1;
  return count;
}

/** Throw a pathful, line-pointing error for an unsupported YAML feature. */
function throwUnsupported(absolutePath: string, lineIndex: number, line: string, feature: string): never {
  const lineNumber = lineIndex + 1;
  const message =
    `pnpm-workspace.yaml: unsupported YAML feature (${feature}) at ${absolutePath}:${lineNumber}\n` +
    `  ${line}\n` +
    "readyup's workspace discovery handles the common block-sequence form for `packages:`.\n" +
    'If you need broader YAML support, please open an issue.';
  throw new Error(message);
}

/** Throw a pathful, line-pointing error for a negation pattern. */
function throwNegationUnsupported(absolutePath: string, lineIndex: number, line: string, pattern: string): never {
  const lineNumber = lineIndex + 1;
  const message =
    `pnpm-workspace.yaml: negation pattern "${pattern}" is not supported at ${absolutePath}:${lineNumber}\n` +
    `  ${line}\n` +
    "Negation patterns are not supported in this release of readyup's workspace discovery.\n" +
    'If you need negation support, please open an issue.';
  throw new Error(message);
}

// endregion | Helpers
