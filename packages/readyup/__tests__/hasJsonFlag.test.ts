import { describe, expect, it } from 'vitest';

import { hasJsonFlag } from '../src/hasJsonFlag.ts';

describe(hasJsonFlag, () => {
  it.each([
    { label: 'the long flag', argv: ['run', '--json'] },
    { label: 'the short flag', argv: ['run', '-j'] },
    { label: 'a short cluster leading with j', argv: ['run', '-jJ'] },
    { label: 'a short cluster ending with j', argv: ['run', '-Jj'] },
    { label: 'a flag preceding an unparseable one', argv: ['--json', '--bogus'] },
  ])('detects JSON mode from $label', ({ argv }) => {
    expect(hasJsonFlag(argv)).toBe(true);
  });

  it.each([
    { label: 'no flags at all', argv: ['run', 'deploy'] },
    { label: 'an unrelated long flag', argv: ['run', '--jit'] },
    { label: 'an unrelated short cluster', argv: ['run', '-Ji'] },
    { label: 'a positional that merely contains j', argv: ['run', 'json'] },
  ])('reports no JSON mode for $label', ({ argv }) => {
    expect(hasJsonFlag(argv)).toBe(false);
  });

  it.each([
    { label: 'the long flag', argv: ['run', '--', '--json'] },
    { label: 'the short flag', argv: ['run', '--', '-j'] },
  ])('ignores $label after the -- terminator', ({ argv }) => {
    expect(hasJsonFlag(argv)).toBe(false);
  });

  it('detects a flag appearing before the -- terminator', () => {
    expect(hasJsonFlag(['run', '--json', '--', '-x'])).toBe(true);
  });
});
