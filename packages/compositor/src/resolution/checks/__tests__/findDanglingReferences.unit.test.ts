import { describe, expect, it } from 'vitest';

import { requireEntry } from '../../../test-utils/requireEntry.ts';
import { buildCatalog } from '../../test-utils/buildCatalog.ts';
import { findDanglingReferences } from '../findDanglingReferences.ts';

describe(findDanglingReferences, () => {
  it('accepts a catalog whose every reference resolves', () => {
    expect(findDanglingReferences(buildCatalog())).toStrictEqual([]);
  });

  it('if an entry names a kind no table carries, locates the dangling reference', () => {
    const catalog = buildCatalog();
    requireEntry(catalog.entries, 0).kindId = 'rulebook';

    expect(findDanglingReferences(catalog)).toStrictEqual([
      {
        path: 'entries[0].kindId',
        message: 'references "rulebook", which is not an entry in kinds',
      },
    ]);
  });

  it('if a winner names a source no table carries, locates the dangling reference', () => {
    const catalog = buildCatalog();
    requireEntry(catalog.entries, 1).resolution.winner.sourceId = 'vendor';

    expect(findDanglingReferences(catalog)).toStrictEqual([
      {
        path: 'entries[1].resolution.winner.sourceId',
        message: 'references "vendor", which is not an entry in sources',
      },
    ]);
  });

  it('if a shadowed candidate names a source no table carries, locates the dangling reference', () => {
    const catalog = buildCatalog();
    requireEntry(requireEntry(catalog.entries, 2).resolution.shadowed, 0).sourceId = 'vendor';

    expect(findDanglingReferences(catalog)).toStrictEqual([
      {
        path: 'entries[2].resolution.shadowed[0].sourceId',
        message: 'references "vendor", which is not an entry in sources',
      },
    ]);
  });
});
