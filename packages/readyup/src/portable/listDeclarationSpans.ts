import { getLineAtOffset } from './getLineAtOffset.ts';

// Keywords introducing a binding, which reach the unnamed-head test only where no name follows them.
const BINDING_KEYWORDS = new Set(['const', 'let', 'var']);
// A named head: optional modifiers in any order, the keyword introducing the declaration, then the name. Sticky, so a
// caller tests one offset without slicing the source behind it.
const HEAD_PATTERN =
  /(?:(?:abstract|async|declare|default|export)\s+)*(?:function[\s*]+|(?:class|const|enum|interface|let|type|var)\s+)([A-Za-z_$][\w$]*)/y;
// Keywords taking an operand after them, so a head following one continues an expression rather than beginning a
// statement. Reading one leaves the window it inherited, because it completes no operand of its own. The head
// modifiers are here for `async`, the one among them that is also legal in expression position. Membership is read
// through `expectsOperand`, which first rules out a property spelled like one of these.
const OPERAND_EXPECTING_KEYWORDS = new Set([
  'abstract',
  'async',
  'await',
  'case',
  'declare',
  'default',
  'delete',
  'export',
  'in',
  'instanceof',
  'new',
  'of',
  'return',
  'typeof',
  'void',
  'yield',
]);
// Characters a statement can end with. A head following one begins a statement of its own; a head following anything
// else continues an expression, which is what `function` or `class` after `(`, `=`, or `,` introduces. `>` is admitted
// because it closes a generic argument list, which a statement can end on.
const STATEMENT_END = /[\w$)\]>;}'"`]/;
// Keywords opening a statement that declares no name.
const STATEMENT_KEYWORDS = new Set(['do', 'export', 'for', 'if', 'import', 'switch', 'throw', 'try', 'while']);
const WORD_CHAR = /[\w$]/;

/** A top-level declaration and the 1-based line range it owns. */
export interface DeclarationSpan {
  endLine: number;
  name: string;
  startLine: number;
}

/** A declaration head found at brace depth 0, with the name it introduces where it introduces one. */
interface Head {
  name?: string | undefined;
  startLine: number;
}

/**
 * Lists the top-level named declarations of blanked source as the line ranges they own, in the order they appear.
 *
 * Takes what `blankNonCode` produced, so a declaration written in a comment or quoted in a string is invisible here
 * while the code around it is not. The lines are the ones `getLineAtOffset` resolves, which is what a caller holding a
 * finding's line compares against.
 *
 * A declaration owns the lines from its own head to the line before the next head, or to the file's last line where it
 * is the last. Starts rather than ends, because the closing brace is not a reliable end marker: a generic constraint
 * and a return-type annotation can each hold braces of their own, and an overload signature has no body to close. A
 * span cut short reports code the caller meant to cover. The cost is the other direction: a module-scope statement
 * trailing a declaration with no head between them is read as part of it, which is the bias this takes deliberately.
 *
 * A statement declaring no name ends the declaration before it and begins none, so an export clause, an import, a
 * destructuring binding, and a control-flow statement each bound the span ahead of them without owning lines of their
 * own. Each is recognized by the keyword it opens with; a statement opening with an identifier, such as a bare call,
 * has no keyword to recognize it by and is read as part of the declaration before it.
 *
 * A head is recognized at brace depth 0, and only where a statement could have ended just before it, so a named
 * function or class expression in an initializer, in an argument list, or as an arrow's body reads as the expression
 * it is rather than as a declaration of its own. A keyword still expecting an operand ends no statement, which is what
 * keeps `async`, `new`, and `typeof` from reopening that gap for the expression after them. A declaration nested in a
 * `namespace` or a module block sits below depth 0 and yields no span.
 *
 * @internal
 */
export function listDeclarationSpans(code: string): DeclarationSpan[] {
  const heads = listHeads(code);
  const lastLine = getLineAtOffset(code, Math.max(code.length - 1, 0));

  const spans: DeclarationSpan[] = [];
  for (const [index, head] of heads.entries()) {
    const { name, startLine } = head;
    if (name === undefined) continue;

    const nextStartLine = heads[index + 1]?.startLine ?? lastLine + 1;
    spans.push({ endLine: Math.max(nextStartLine - 1, startLine), name, startLine });
  }

  return spans;
}

// region | Helpers

/**
 * Reports whether a word leaves an operand still expected after it, so the window it inherited stands.
 *
 * A member name spelled like one of the keywords is the property it names: `mod.default` completes an operand, and
 * withholding the boundary there loses the statement end that semicolon-free source depends on. The introducing `.`
 * or `#` is what tells the two apart, and an optional chain leaves the same `.`.
 */
function expectsOperand(previousChars: string, word: string): boolean {
  const lastChar = previousChars.at(-1) ?? '';
  if (lastChar === '.' || lastChar === '#') return false;

  return OPERAND_EXPECTING_KEYWORDS.has(word);
}

/** Returns the first non-blank character at or after an offset, or the empty string where the source ends first. */
function findNextNonBlank(code: string, from: number): string {
  let index = from;
  while (index < code.length && /\s/.test(code[index] ?? '')) index += 1;
  return code[index] ?? '';
}

/** Returns the offset past the word beginning at an offset. */
function findWordEnd(code: string, from: number): number {
  let index = from;
  while (index < code.length && WORD_CHAR.test(code[index] ?? '')) index += 1;
  return index;
}

/**
 * Reports whether a word opening a statement opens one that declares no name.
 *
 * Two of the keywords are read further than the word itself. A binding keyword reaches here only where `HEAD_PATTERN`
 * found no name after it, which leaves a destructuring pattern, so the character opening one is required; that
 * requirement keeps `as const` out, where the same keyword ends a type assertion. An `import` opening a call is the
 * dynamic form, which is an operand inside the statement around it rather than a statement of its own.
 */
function isUnnamedHead(code: string, word: string, wordEnd: number): boolean {
  if (BINDING_KEYWORDS.has(word)) {
    const nextChar = findNextNonBlank(code, wordEnd);
    return nextChar === '[' || nextChar === '{';
  }
  if (word === 'import') return findNextNonBlank(code, wordEnd) !== '(';

  return STATEMENT_KEYWORDS.has(word);
}

/** Appends a character to the two-character window the head test reads. */
function keepLastTwo(previousChars: string, char: string): string {
  return `${previousChars}${char}`.slice(-2);
}

/**
 * Lists the heads of blanked source in the order they appear, counting braces to keep to the top level.
 *
 * Braces alone are counted, because a literal's text is already blanked and every brace a template interpolation
 * contributes is balanced by its own closing one.
 */
function listHeads(code: string): Head[] {
  const heads: Head[] = [];
  let braceDepth = 0;
  let index = 0;
  // The last two non-blank characters read, which decide whether a head begins a statement or continues an expression.
  let previousChars = '';

  while (index < code.length) {
    const char = code[index] ?? '';
    if (char === '{' || char === '}') {
      if (char === '{') braceDepth += 1;
      else if (braceDepth > 0) braceDepth -= 1;
      previousChars = keepLastTwo(previousChars, char);
      index += 1;
      continue;
    }
    if (!WORD_CHAR.test(char)) {
      if (!/\s/.test(char)) previousChars = keepLastTwo(previousChars, char);
      index += 1;
      continue;
    }

    const wordEnd = findWordEnd(code, index);
    const word = code.slice(index, wordEnd);
    if (braceDepth === 0 && startsStatement(previousChars)) {
      HEAD_PATTERN.lastIndex = index;
      const match = HEAD_PATTERN.exec(code);
      if (match !== null && match[1] !== undefined) {
        heads.push({ name: match[1], startLine: getLineAtOffset(code, index) });
        index += match[0].length;
        previousChars = keepLastTwo(previousChars, code[index - 1] ?? '');
        continue;
      }

      if (isUnnamedHead(code, word, wordEnd)) heads.push({ startLine: getLineAtOffset(code, index) });
    }

    if (!expectsOperand(previousChars, word)) previousChars = keepLastTwo(previousChars, word.at(-1) ?? '');
    index = wordEnd;
  }

  return heads;
}

/**
 * Reports whether a head following the given characters begins a statement rather than continuing an expression.
 *
 * The last character decides, except that an arrow's `>` closes no operand: it introduces the arrow function's body,
 * and a `function` or `class` there is that body rather than a declaration of its own.
 */
function startsStatement(previousChars: string): boolean {
  if (previousChars.endsWith('=>')) return false;
  const lastChar = previousChars.at(-1) ?? '';
  return lastChar === '' || STATEMENT_END.test(lastChar);
}

// endregion | Helpers
