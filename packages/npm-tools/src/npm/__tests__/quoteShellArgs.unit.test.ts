import { describe, expect, it } from 'vitest';

import { quoteShellArgs } from '../quoteShellArgs.ts';

describe(quoteShellArgs, () => {
  it('leaves safe arguments bare', () => {
    expect(quoteShellArgs(['npm', 'trust', '@scope/name', '--repo', 'owner/repo'])).toBe(
      'npm trust @scope/name --repo owner/repo',
    );
  });

  it('single-quotes arguments that hold other characters, escaping embedded quotes', () => {
    expect(quoteShellArgs(['a b', "it's", ''])).toBe(String.raw`'a b' 'it'\''s' ''`);
  });
});
