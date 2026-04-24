import { readFileSync } from 'node:fs';

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

  const packagesLineIndex = findPackagesKeyLine(lines);
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

/** Find the line containing the top-level `packages:` key. Returns -1 if absent. */
function findPackagesKeyLine(lines: string[]): number {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (isBlankOrComment(line)) continue;
    // Top-level keys start at column 0 (no leading whitespace).
    if (/^\s/.test(line)) continue;
    const match = /^([A-Za-z_][\w-]*)\s*:(.*)$/.exec(line);
    if (match === null) continue;
    if (match[1] === 'packages') return index;
  }
  return -1;
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

  const firstChar = trimmed[0];

  if (firstChar === '&') {
    throwUnsupported(absolutePath, lineIndex, line, 'anchor (&name)');
  }
  if (firstChar === '*') {
    throwUnsupported(absolutePath, lineIndex, line, 'alias (*name)');
  }
  if (firstChar === '[' || firstChar === '{') {
    throwUnsupported(absolutePath, lineIndex, line, 'flow sequence or mapping');
  }
  if (firstChar === '|' || firstChar === '>') {
    throwUnsupported(absolutePath, lineIndex, line, 'block scalar (| or >)');
  }
  // `!!tag` (e.g., `!!str`) is a YAML verbatim tag; always unsupported.
  // A single-`!` prefix on a plain (unquoted) scalar is treated as a negation pattern
  // (e.g., `!packages/deprecated/*`) and is handled downstream after unquoting.
  if (trimmed.startsWith('!!')) {
    throwUnsupported(absolutePath, lineIndex, line, 'YAML tag');
  }
}

/** Strip outer quotes from a sequence-item value. Does not interpret escapes. */
function unquote(value: string, absolutePath: string, lineIndex: number, line: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value.at(-1);
    if (first === "'" && last === "'") {
      return value.slice(1, -1);
    }
    if (first === '"' && last === '"') {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") || value.startsWith('"')) {
    // Unterminated quoted scalar.
    throwUnsupported(absolutePath, lineIndex, line, 'unterminated quoted scalar');
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
