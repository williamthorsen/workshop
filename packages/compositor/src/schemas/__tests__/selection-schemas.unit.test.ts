import { describe, expect, it } from 'vitest';

import { KindSelectionSchema, SelectorSchema, SelectSchema } from '../selection-schemas.ts';
import { findIssuePaths } from '../test-utils/findIssuePaths.ts';

describe('SelectorSchema', () => {
  it('reads a bare string as the artifact it names', () => {
    expect(SelectorSchema.parse('lint')).toStrictEqual({ artifact: 'lint' });
  });

  it.each([
    ['an artifact', { artifact: 'lint' }],
    ['a source', { source: 'acme' }],
  ])('accepts the object form naming %s', (_label, selector) => {
    expect(SelectorSchema.parse(selector)).toStrictEqual(selector);
  });

  // Rejecting rather than stripping is the point: a strip would discard half of what the author wrote.
  it('rejects an entry naming both an artifact and a source', () => {
    expect(findIssuePaths(SelectorSchema, { artifact: 'lint', source: 'acme' })).toBeDefined();
  });

  it('rejects an entry naming neither', () => {
    expect(findIssuePaths(SelectorSchema, {})).toBeDefined();
  });
});

describe('SelectSchema', () => {
  it('normalizes a kind-keyed mapping into entries sorted by kind', () => {
    const select = SelectSchema.parse({ skill: { use: ['lint'] }, rulebook: { use: ['house-style'] } });

    expect(select).toStrictEqual([
      { kindId: 'rulebook', use: [{ artifact: 'house-style' }], drop: [] },
      { kindId: 'skill', use: [{ artifact: 'lint' }], drop: [] },
    ]);
  });

  // A kind key with nothing under it is what an author leaves behind after commenting every entry out.
  it('reads a kind whose block is null as declaring nothing', () => {
    expect(SelectSchema.parse({ skill: null })).toStrictEqual([{ kindId: 'skill', use: [], drop: [] }]);
  });

  it('rejects an array naming one kind twice', () => {
    const select = [
      { kindId: 'skill', use: ['lint'] },
      { kindId: 'skill', use: ['format'] },
    ];

    expect(findIssuePaths(SelectSchema, select)).toBeDefined();
  });
});

describe('KindSelectionSchema', () => {
  it('defaults both lists to empty', () => {
    expect(KindSelectionSchema.parse({ kindId: 'skill' })).toStrictEqual({ kindId: 'skill', use: [], drop: [] });
  });
});
