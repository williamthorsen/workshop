import { describe, expect, it } from 'vitest';

import { requireEntry } from '../requireEntry.ts';

describe(requireEntry, () => {
  it('returns the entry the index names', () => {
    expect(requireEntry(['first', 'second'], 1)).toBe('second');
  });

  it('if the fixture is shorter than the index, names the index rather than returning undefined', () => {
    expect(() => {
      requireEntry(['only'], 3);
    }).toThrow('Fixture holds no entry at index 3.');
  });
});
