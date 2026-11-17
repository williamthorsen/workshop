import { describe, expect, it } from 'vitest';

import { quoteJqlValue } from '../quoteJqlValue.ts';

describe(quoteJqlValue, () => {
  it('wraps a plain value in double quotes', () => {
    expect(quoteJqlValue('To Do')).toBe('"To Do"');
  });

  it('escapes a double quote rather than ending the string', () => {
    expect(quoteJqlValue('Say "done"')).toBe(String.raw`"Say \"done\""`);
  });

  it('escapes a backslash rather than escaping the next character', () => {
    expect(quoteJqlValue(String.raw`A\B`)).toBe(String.raw`"A\\B"`);
  });
});
