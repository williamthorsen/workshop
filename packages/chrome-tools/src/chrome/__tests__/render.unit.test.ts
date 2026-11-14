import { describe, expect, it } from 'vitest';

import { describeProfileCount, formatCommandLine, stringifyJson } from '../render.ts';

describe(stringifyJson, () => {
  it('escapes control characters as the bash renderer did', () => {
    expect(stringifyJson({ value: 'a\nb\rc\td\be\ff\u{1}"\\' })).toBe(
      String.raw`{"value":"a\nb\rc\td\u0008e\u000cf\u0001\"\\"}`,
    );
  });

  it('leaves a literal backslash followed by b or f alone', () => {
    expect(stringifyJson(String.raw`\b\f`)).toBe(String.raw`"\\b\\f"`);
  });
});

describe(describeProfileCount, () => {
  it('names one profile in the singular', () => {
    expect(describeProfileCount(1)).toBe('1 profile');
    expect(describeProfileCount(0)).toBe('0 profiles');
  });
});

describe(formatCommandLine, () => {
  it('quotes each argument as bash does', () => {
    expect(formatCommandLine(['/a b/chrome', '--window-name=x · :1', 'http://h/?a=1&b=2'])).toBe(
      String.raw`/a\ b/chrome --window-name=x\ ·\ :1 http://h/\?a=1\&b=2`,
    );
  });
});
