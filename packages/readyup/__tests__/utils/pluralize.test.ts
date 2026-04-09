import { describe, expect, it } from 'vitest';

import { pluralize, pluralizeWithCount } from '../../src/utils/pluralize.ts';

describe(pluralize, () => {
  it('returns the singular form for count 1', () => {
    expect(pluralize(1, 'apple')).toBe('apple');
  });

  it('returns the plural form for count other than 1', () => {
    expect(pluralize(1.1, 'apple')).toBe('apples');
    expect(pluralize(0, 'apple')).toBe('apples');
    expect(pluralize(-1, 'apple')).toBe('apple');
  });

  it('uses a custom plural form if given', () => {
    expect(pluralize(2, 'child', 'children')).toBe('children');
  });
});

describe(pluralizeWithCount, () => {
  it('returns the singular form with count for count 1', () => {
    expect(pluralizeWithCount(1, 'apple')).toBe('1 apple');
  });

  it('returns the plural form with count for count other than 1', () => {
    expect(pluralizeWithCount(1.1, 'apple')).toBe('1.1 apples');
    expect(pluralizeWithCount(0, 'apple')).toBe('0 apples');
    expect(pluralizeWithCount(-1, 'apple')).toBe('-1 apple');
  });

  it('uses a custom plural form if given', () => {
    expect(pluralizeWithCount(2, 'child', 'children')).toBe('2 children');
  });
});
