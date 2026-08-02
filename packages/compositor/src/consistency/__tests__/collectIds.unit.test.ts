import { describe, expect, it } from 'vitest';

import { collectIds } from '../collectIds.ts';

describe(collectIds, () => {
  it('collects the id of every entry', () => {
    expect(collectIds([{ id: 'skill:review' }, { id: 'skill:lint' }])).toStrictEqual(
      new Set(['skill:review', 'skill:lint']),
    );
  });

  it('collapses a repeated id, so a duplicate does not make a reference to it resolve twice', () => {
    expect(collectIds([{ id: 'team' }, { id: 'team' }])).toStrictEqual(new Set(['team']));
  });

  it('collects nothing from an empty table', () => {
    expect(collectIds([])).toStrictEqual(new Set());
  });
});
