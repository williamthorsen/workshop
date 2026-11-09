/** Returns the number of leading space characters on a line. */
export function countLeadingSpaces(line: string): number {
  let count = 0;
  while (count < line.length && line[count] === ' ') count += 1;
  return count;
}

/** Finds the line containing a named top-level key. Returns -1 if absent. */
export function findTopLevelKeyLine(lines: string[], key: string): number {
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

/** Reports whether a line is blank or a full-line comment. */
export function isBlankOrComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === '' || trimmed.startsWith('#');
}

/** Strips an inline `#` comment, keeping a `#` inside a single- or double-quoted scalar as part of the value. */
export function stripInlineComment(text: string): string {
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

/** Strips matching outer quotes from a scalar, leaving an unquoted or unterminated one as it is. */
export function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    if ((first === "'" || first === '"') && value.at(-1) === first) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Leading characters that mark a plain scalar as opening an unsupported YAML feature, mapped to the
 * feature name reported for each. A feature with two spellings appears once per character. The catalog
 * reader reports no version for a value that opens with one, and the workspace-packages reader throws.
 */
export const UNSUPPORTED_SCALAR_LEADERS = new Map([
  ['&', 'anchor (&name)'],
  ['*', 'alias (*name)'],
  ['[', 'flow sequence or mapping'],
  ['{', 'flow sequence or mapping'],
  ['|', 'block scalar (| or >)'],
  ['>', 'block scalar (| or >)'],
]);
