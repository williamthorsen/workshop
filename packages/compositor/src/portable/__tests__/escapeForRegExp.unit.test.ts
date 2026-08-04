import { describe, expect, it } from 'vitest';

import { escapeForRegExp } from '../escapeForRegExp.ts';

describe(escapeForRegExp, () => {
  it('leaves a string carrying no metacharacter alone', () => {
    expect(escapeForRegExp('rulebook:naming')).toBe('rulebook:naming');
  });

  const metacharacters = ['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\'];

  it.each(metacharacters)('escapes %s, so it matches itself rather than acting', (metacharacter) => {
    const pattern = new RegExp(`^${escapeForRegExp(metacharacter)}$`);

    expect(pattern.test(metacharacter)).toBe(true);
  });

  it('escapes every metacharacter in one string', () => {
    const literal = String.raw`a.b*c+d?e^f$g{h}i(j)k|l[m]n\o`;

    expect(new RegExp(`^${escapeForRegExp(literal)}$`).test(literal)).toBe(true);
  });

  // The class is a literal set rather than a range, so a character outside it must survive unescaped.
  it('leaves a character outside the metacharacter set alone', () => {
    expect(escapeForRegExp('a-b/c!d')).toBe('a-b/c!d');
  });

  it('escapes an expression that would otherwise match text it does not equal', () => {
    expect(new RegExp(escapeForRegExp('a.c')).test('abc')).toBe(false);
  });
});
