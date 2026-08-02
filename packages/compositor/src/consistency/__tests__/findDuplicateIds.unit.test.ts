import { describe, expect, it } from 'vitest';

import { findDuplicateIds } from '../findDuplicateIds.ts';

describe(findDuplicateIds, () => {
  it('if a table carries one id twice, reports the repeat under the table name', () => {
    expect(findDuplicateIds([['sources', [{ id: 'team' }, { id: 'team' }]]])).toStrictEqual([
      { path: 'sources', message: 'carries "team" more than once' },
    ]);
  });

  it('if every id is unique, reports nothing', () => {
    expect(findDuplicateIds([['sources', [{ id: 'team' }, { id: 'library' }]]])).toStrictEqual([]);
  });

  it('if one id repeats three times, reports it once rather than once per repeat', () => {
    expect(findDuplicateIds([['sources', [{ id: 'team' }, { id: 'team' }, { id: 'team' }]]])).toStrictEqual([
      { path: 'sources', message: 'carries "team" more than once' },
    ]);
  });

  it('reports in the order of the tables it was given, which is what fixes the order a caller sees', () => {
    const violations = findDuplicateIds([
      ['targets', [{ id: 'claude' }, { id: 'claude' }]],
      ['sources', [{ id: 'team' }, { id: 'team' }]],
    ]);

    expect(violations.map(({ path }) => path)).toStrictEqual(['targets', 'sources']);
  });
});
