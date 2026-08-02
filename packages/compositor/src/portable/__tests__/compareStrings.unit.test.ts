import { describe, expect, it } from 'vitest';

import { compareStrings } from '../compareStrings.ts';

describe(compareStrings, () => {
  it('reports two equal strings as equal', () => {
    expect(compareStrings('skill:lint', 'skill:lint')).toBe(0);
  });

  it('orders by code unit rather than by locale, so a run reproduces anywhere', () => {
    // `localeCompare` puts 'a' first under most locales; the payload order this comparator produces must not depend on
    // which locale data the runtime happens to ship.
    expect(compareStrings('Z', 'a')).toBeLessThan(0);
  });

  it('sorts a list into the order a consumer diffing two payloads reproduces', () => {
    const ids = ['skill:review', 'collection:core', 'skill:lint'];

    expect(ids.toSorted(compareStrings)).toStrictEqual(['collection:core', 'skill:lint', 'skill:review']);
  });
});
