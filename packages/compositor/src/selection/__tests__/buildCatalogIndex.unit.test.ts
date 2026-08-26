import { describe, expect, it } from 'vitest';

import { buildCatalogFromSpec } from '../../test-utils/buildCatalogFromSpec.ts';
import { buildCatalogIndex } from '../buildCatalogIndex.ts';

const catalog = buildCatalogFromSpec({
  kinds: ['rulebook', 'skill', 'partial'],
  sources: ['local', 'acme'],
  entries: [
    { kindId: 'skill', slug: 'lint', copySourceIds: ['acme'] },
    { kindId: 'skill', slug: 'review', copySourceIds: ['local', 'acme'] },
    { kindId: 'rulebook', slug: 'house-style', copySourceIds: ['local'] },
  ],
});

describe(buildCatalogIndex, () => {
  it('names every kind the catalog declares, including one with no entries', () => {
    expect([...buildCatalogIndex(catalog).kindIds].toSorted()).toStrictEqual(['partial', 'rulebook', 'skill']);
  });

  it('names every source the catalog declares', () => {
    expect([...buildCatalogIndex(catalog).sourceIds].toSorted()).toStrictEqual(['acme', 'local']);
  });

  it('maps a slug to its artifact id, keyed by kind', () => {
    expect(buildCatalogIndex(catalog).bySlug.get('skill')?.get('lint')).toBe('skill:lint');
  });

  it('keeps one kind’s slugs out of another’s, so two kinds may share a slug', () => {
    expect(buildCatalogIndex(catalog).bySlug.get('rulebook')?.get('lint')).toBeUndefined();
  });

  it('indexes an artifact under the source that won it', () => {
    expect(buildCatalogIndex(catalog).bySource.get('skill')?.get('acme')).toContain('skill:lint');
  });

  it('indexes an artifact under a source whose copy is shadowed, not the winner alone', () => {
    expect(buildCatalogIndex(catalog).bySource.get('skill')?.get('local')).toStrictEqual(['skill:review']);
  });

  it('omits a source with no entries of a kind from the index', () => {
    expect(buildCatalogIndex(catalog).bySource.get('rulebook')?.get('acme')).toBeUndefined();
  });
});
