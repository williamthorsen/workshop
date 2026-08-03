import { describe, expect, it } from 'vitest';

import { hasJsonFlag } from '../src/hasJsonFlag.ts';

describe(hasJsonFlag, () => {
  it.each([
    { label: 'the long flag', argv: ['run', '--json'] },
    { label: 'a flag preceding an unparseable one', argv: ['--json', '--bogus'] },
  ])('detects JSON mode from $label', ({ argv }) => {
    expect(hasJsonFlag(argv)).toBe(true);
  });

  it.each([
    { label: 'no flags at all', argv: ['run', 'deploy'] },
    { label: 'an unrelated long flag', argv: ['run', '--jit'] },
    { label: 'the retired -j short', argv: ['run', '-j'] },
    { label: 'a short cluster containing j', argv: ['run', '-jJ'] },
    { label: 'a positional that merely contains j', argv: ['run', 'json'] },
  ])('reports no JSON mode for $label', ({ argv }) => {
    expect(hasJsonFlag(argv)).toBe(false);
  });

  it('ignores the long flag after the -- terminator', () => {
    expect(hasJsonFlag(['run', '--', '--json'])).toBe(false);
  });

  it('detects a flag appearing before the -- terminator', () => {
    expect(hasJsonFlag(['run', '--json', '--', '-x'])).toBe(true);
  });
});
