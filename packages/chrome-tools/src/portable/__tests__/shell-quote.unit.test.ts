import { describe, expect, it } from 'vitest';

import { quoteBashArgument } from '../shell-quote.ts';

describe(quoteBashArgument, () => {
  it('leaves a word that bash prints unescaped bare, including non-ASCII text', () => {
    expect(quoteBashArgument('--user-data-dir=/a/b.c@d%e+f-g#h~')).toBe('--user-data-dir=/a/b.c@d%e+f-g#h~');
    expect(quoteBashArgument('·')).toBe('·');
  });

  it('backslash-escapes a space and each shell metacharacter', () => {
    expect(quoteBashArgument('thrive · :9321')).toBe(String.raw`thrive\ ·\ :9321`);
    expect(quoteBashArgument(String.raw`!"$&'()*,;<>?[\]^` + '`{|}')).toBe(
      String.raw`\!\"\$\&\'\(\)\*\,\;\<\>\?\[\\\]\^` + '\\`\\{\\|\\}',
    );
  });

  it('escapes a tilde at the start or after = or :, and a hash at the start', () => {
    expect(quoteBashArgument('~a')).toBe(String.raw`\~a`);
    expect(quoteBashArgument('--x=~/p')).toBe(String.raw`--x=\~/p`);
    expect(quoteBashArgument('a:~b')).toBe(String.raw`a:\~b`);
    expect(quoteBashArgument('#a')).toBe(String.raw`\#a`);
  });

  it('ANSI-C quotes a word containing a control character', () => {
    expect(quoteBashArgument("a b\u{1}\u{7F}\u{1B}\u{7}\u{B}\u{C}\r'c\\d$e")).toBe(
      String.raw`$'a b\001\177\E\a\v\f\r\'c\\d$e'`,
    );
    expect(quoteBashArgument('a\nb\tc\bd')).toBe(String.raw`$'a\nb\tc\bd'`);
  });

  it('quotes an empty word', () => {
    expect(quoteBashArgument('')).toBe("''");
  });
});
