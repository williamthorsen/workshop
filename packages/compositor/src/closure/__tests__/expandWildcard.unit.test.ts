import { describe, expect, it } from 'vitest';

import type { CatalogEntry } from '../../schemas/catalog-schemas.ts';
import { buildCatalogIndex } from '../../selection/buildCatalogIndex.ts';
import { buildCatalogFromSpec } from '../../test-utils/buildCatalogFromSpec.ts';
import { requireEntry } from '../../test-utils/requireEntry.ts';
import { expandWildcard } from '../expandWildcard.ts';

const catalog = buildCatalogFromSpec({
  traversalOnlyKinds: ['collection'],
  sources: ['team', 'library'],
  entries: [
    { kindId: 'collection', slug: 'core', carriedBy: ['team'] },
    { kindId: 'collection', slug: 'extra', carriedBy: ['team'] },
    { kindId: 'skill', slug: 'review', carriedBy: ['team', 'library'] },
    { kindId: 'skill', slug: 'lint', carriedBy: ['library'] },
    { kindId: 'subagent', slug: 'auditor', carriedBy: ['team'] },
  ],
});
const index = buildCatalogIndex(catalog);
const emittingKindIds = catalog.kinds.filter((kind) => kind.emitsFiles).map(({ id }) => id);

describe(expandWildcard, () => {
  it('names every emitting artifact the declaring source carries, in kind then catalog order', () => {
    expect(expandWildcard(entryFor('collection:core'), index, emittingKindIds)).toStrictEqual([
      'skill:review',
      'subagent:auditor',
    ]);
  });

  it('names no aggregate, so an aggregate of everything does not take in its siblings', () => {
    expect(expandWildcard(entryFor('collection:core'), index, emittingKindIds)).not.toContain('collection:extra');
  });

  it('names an artifact a higher-precedence source shadows, shadowing settling the copy rather than the set', () => {
    expect(expandWildcard(entryFor('skill:lint'), index, emittingKindIds)).toStrictEqual(['skill:review']);
  });

  it('excludes the declaring artifact, which would otherwise close a cycle on itself', () => {
    expect(expandWildcard(entryFor('skill:review'), index, emittingKindIds)).toStrictEqual(['subagent:auditor']);
  });

  it('names nothing when the declaring source carries nothing else that emits', () => {
    const alone = buildCatalogFromSpec({
      traversalOnlyKinds: ['collection'],
      sources: ['team'],
      entries: [{ kindId: 'collection', slug: 'core', carriedBy: ['team'] }],
    });

    expect(expandWildcard(requireEntry(alone.entries, 0), buildCatalogIndex(alone), ['skill'])).toStrictEqual([]);
  });
});

// region | Helpers

/** Reads the catalog entry with `id`, failing the test when the fixture carries none. */
function entryFor(id: string): CatalogEntry {
  const entry = catalog.entries.find((candidate) => candidate.id === id);
  if (entry === undefined) {
    throw new Error(`Fixture carries no entry "${id}".`);
  }
  return entry;
}

// endregion | Helpers
