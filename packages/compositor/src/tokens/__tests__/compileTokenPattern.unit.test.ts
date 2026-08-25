import { describe, expect, it } from 'vitest';

import type { TokenKind } from '../../schemas/token-kind-schemas.ts';
import { compileTokenPattern } from '../compileTokenPattern.ts';

const kind: TokenKind = { id: 'tool', label: 'Tool name', form: 'mapping', pattern: String.raw`\{tool:(\w+)\}` };

describe(compileTokenPattern, () => {
  it('compiles the declared source and captures the name the token contains', () => {
    expect(compileTokenPattern(kind).exec('Use {tool:Read}.')?.[1]).toBe('Read');
  });

  it('matches globally, so a line containing several tokens yields them all', () => {
    const matches = '{tool:Read} and {tool:Edit}'.matchAll(compileTokenPattern(kind)).toArray();

    expect(matches.map((match) => match[1])).toStrictEqual(['Read', 'Edit']);
  });

  it('matches case-sensitively, so a declaration cannot widen what it recognizes through the flags', () => {
    expect(compileTokenPattern(kind).test('{TOOL:Read}')).toBe(false);
  });

  it('does not let a dot cross a line, so a token stays within the line an author wrote it on', () => {
    const greedy: TokenKind = { ...kind, pattern: String.raw`\{tool:(.+)\}` };

    expect(compileTokenPattern(greedy).test('{tool:Read\nEdit}')).toBe(false);
  });

  it('anchors to the whole input rather than to each line, which is why both surfaces match one line at a time', () => {
    const anchored: TokenKind = { ...kind, pattern: String.raw`^\{tool:(\w+)\}` };

    expect(compileTokenPattern(anchored).test('Use {tool:Read}.')).toBe(false);
  });
});
