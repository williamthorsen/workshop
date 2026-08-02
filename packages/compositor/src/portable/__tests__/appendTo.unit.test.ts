import { describe, expect, it } from 'vitest';

import { appendTo } from '../appendTo.ts';

describe(appendTo, () => {
  it('starts a list when the key is new', () => {
    const index = new Map<string, Array<number>>();

    appendTo(index, 'skill', 1);

    expect(index.get('skill')).toStrictEqual([1]);
  });

  it('appends to the list a key already maps to, keeping insertion order', () => {
    const index = new Map<string, Array<number>>([['skill', [1]]]);

    appendTo(index, 'skill', 2);
    appendTo(index, 'skill', 3);

    expect(index.get('skill')).toStrictEqual([1, 2, 3]);
  });

  it('keeps a repeated value, since sameness is the caller’s question rather than the index’s', () => {
    const index = new Map<string, Array<number>>();

    appendTo(index, 'skill', 1);
    appendTo(index, 'skill', 1);

    expect(index.get('skill')).toStrictEqual([1, 1]);
  });

  it('leaves other keys untouched', () => {
    const index = new Map<string, Array<number>>([['rulebook', [9]]]);

    appendTo(index, 'skill', 1);

    expect(index.get('rulebook')).toStrictEqual([9]);
  });
});
