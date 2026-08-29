import { describe, expect, it } from 'vitest';

import { createIgnorePragmaMatcher } from '../pragma-token.ts';

const SOURCE = 'x; // rdy-ignore';

describe(createIgnorePragmaMatcher, () => {
  it('matches a pragma and its `-next-line` suffix', () => {
    const matches = '// rdy-ignore-next-line'.matchAll(createIgnorePragmaMatcher()).toArray();

    expect(matches).toHaveLength(1);
    expect(matches[0]?.[1]).toBe('-next-line');
  });

  it('opens each scan at the start of the text however an earlier matcher was used', () => {
    // `matchAll` copies its regular expression's `lastIndex`, so a matcher one reader advanced would silently
    // report that a pragma before that offset is not there.
    const used = createIgnorePragmaMatcher();
    used.test('a rdy-ignore b');

    expect(SOURCE.matchAll(createIgnorePragmaMatcher()).toArray()).toHaveLength(1);
  });
});
