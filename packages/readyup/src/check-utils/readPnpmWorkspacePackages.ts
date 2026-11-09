import { readFileSync } from 'node:fs';

import {
  countLeadingSpaces,
  findTopLevelKeyLine,
  isBlankOrComment,
  stripInlineComment,
  stripQuotes,
  UNSUPPORTED_SCALAR_LEADERS,
} from './yaml-line-scanners.ts';

/**
 * Returns the pattern strings in a `pnpm-workspace.yaml` file's `packages` block-sequence, or
 * `undefined` when the `packages` key is absent.
 *
 * Throws a pathful, line-pointing error on a multi-document stream marker anywhere in the file, and,
 * within the `packages` block, on a value that is not a block sequence, inconsistent item indentation,
 * an item opening an anchor, alias, flow collection, or block scalar, a `!!` tag, an empty item, an
 * unterminated quoted item, or a negation pattern. Other top-level keys are not checked.
 */
export function readPnpmWorkspacePackages(absolutePath: string): string[] | undefined {
  const content = readFileSync(absolutePath, 'utf8');
  const lines = content.split(/\r?\n/);

  rejectStreamMarkers(absolutePath, lines);

  const packagesLineIndex = findTopLevelKeyLine(lines, 'packages');
  if (packagesLineIndex === -1) return undefined;

  const packagesLine = lines[packagesLineIndex] ?? '';
  const inlineValue = extractInlineValue(packagesLine);

  if (inlineValue !== undefined && inlineValue.length > 0) {
    throwUnsupported(absolutePath, packagesLineIndex, packagesLine, 'non-list value for `packages:`');
  }

  return collectSequenceItems(absolutePath, lines, packagesLineIndex);
}

// region | Helpers

/**
 * Returns the block-sequence items below the `packages:` line, up to the next top-level key. Throws on a
 * line that is not a list item, inconsistent indentation, an empty item, and a negation pattern, and
 * through its item checks on the rest.
 */
function collectSequenceItems(absolutePath: string, lines: string[], packagesLineIndex: number): string[] {
  const items: string[] = [];
  let sequenceIndent: number | undefined;

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

    if (sequenceIndent === undefined) {
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

/** Returns the trimmed value after a `key:` on the same line, or `undefined` when there is no inline value. */
function extractInlineValue(line: string): string | undefined {
  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) return undefined;
  const rest = line.slice(colonIndex + 1);
  const commentStripped = stripInlineComment(rest);
  const trimmed = commentStripped.trim();
  return trimmed;
}

/**
 * Rejects a sequence item whose value opens with an anchor, alias, flow-collection, or block-scalar
 * indicator, or with a `!!` tag, before quote-stripping.
 */
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

/** Rejects a multi-document stream marker (`---` or `...`) on any line of the file. */
function rejectStreamMarkers(absolutePath: string, lines: string[]): void {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();
    if (trimmed === '---' || trimmed === '...') {
      throwUnsupported(absolutePath, index, line, 'multi-document stream marker');
    }
  }
}

/** Throws a pathful, line-pointing error for a negation pattern. */
function throwNegationUnsupported(absolutePath: string, lineIndex: number, line: string, pattern: string): never {
  const lineNumber = lineIndex + 1;
  const message =
    `pnpm-workspace.yaml: negation pattern "${pattern}" is not supported at ${absolutePath}:${lineNumber}\n` +
    `  ${line}\n` +
    "Negation patterns are not supported in this release of readyup's workspace discovery.\n" +
    'To request negation support, please open an issue.';
  throw new Error(message);
}

/** Throws a pathful, line-pointing error for an unsupported YAML feature. */
function throwUnsupported(absolutePath: string, lineIndex: number, line: string, feature: string): never {
  const lineNumber = lineIndex + 1;
  const message =
    `pnpm-workspace.yaml: unsupported YAML feature (${feature}) at ${absolutePath}:${lineNumber}\n` +
    `  ${line}\n` +
    "readyup's workspace discovery handles the common block-sequence form for `packages:`.\n" +
    'To request broader YAML support, please open an issue.';
  throw new Error(message);
}

/** Strips outer quotes from a sequence-item value, rejecting an unterminated one. Does not interpret escapes. */
function unquote(value: string, absolutePath: string, lineIndex: number, line: string): string {
  const stripped = stripQuotes(value);
  if (stripped === value && (value.startsWith("'") || value.startsWith('"'))) {
    throwUnsupported(absolutePath, lineIndex, line, 'unterminated quoted scalar');
  }
  return stripped;
}

// endregion | Helpers
