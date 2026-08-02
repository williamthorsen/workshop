import { describe, expect, it } from 'vitest';

import { type Catalog, CatalogSchema } from '../../schemas/resolution-schemas.ts';
import { requireEntry } from '../../test-utils/requireEntry.ts';
import {
  assertCatalogIsConsistent,
  CatalogConsistencyError,
  type CatalogViolation,
} from '../assertCatalogIsConsistent.ts';
import { buildCatalog } from '../test-utils/buildCatalog.ts';

describe(assertCatalogIsConsistent, () => {
  it('accepts a catalog whose references, ids, and precedence all agree', () => {
    expect(() => {
      assertCatalogIsConsistent(buildCatalog());
    }).not.toThrow();
  });

  it('accepts the fixture as structurally valid too, so a violation cannot come from a malformed fixture', () => {
    const catalog = buildCatalog();

    expect(CatalogSchema.parse(catalog)).toStrictEqual(catalog);
  });

  it('if an entry names a kind no table carries, locates the dangling reference', () => {
    const catalog = buildCatalog();
    requireEntry(catalog.entries, 0).kindId = 'rulebook';

    expect(findViolations(catalog)).toContainEqual({
      path: 'entries[0].kindId',
      message: 'references "rulebook", which is not an entry in kinds',
    });
  });

  it('if a winner names a source no table carries, locates the dangling reference', () => {
    const catalog = buildCatalog();
    requireEntry(catalog.entries, 1).resolution.winner.sourceId = 'vendor';

    expect(findViolations(catalog)).toStrictEqual([
      {
        path: 'entries[1].resolution.winner.sourceId',
        message: 'references "vendor", which is not an entry in sources',
      },
    ]);
  });

  it('if a shadowed candidate names a source no table carries, locates the dangling reference', () => {
    const catalog = buildCatalog();
    requireEntry(requireEntry(catalog.entries, 2).resolution.shadowed, 0).sourceId = 'vendor';

    expect(findViolations(catalog)).toStrictEqual([
      {
        path: 'entries[2].resolution.shadowed[0].sourceId',
        message: 'references "vendor", which is not an entry in sources',
      },
    ]);
  });

  it('if a table carries one id twice, names the repeated id', () => {
    const catalog = buildCatalog();
    catalog.sources = [...catalog.sources, { ...requireEntry(catalog.sources, 0), name: 'local-again' }];

    expect(findViolations(catalog)).toStrictEqual([{ path: 'sources', message: 'carries "local" more than once' }]);
  });

  it('if an entry id does not compose its kind and slug, reports what the pair composes', () => {
    const catalog = buildCatalog();
    requireEntry(catalog.entries, 1).id = 'lint';

    expect(findViolations(catalog)).toStrictEqual([
      {
        path: 'entries[1].id',
        message: 'is "lint", and the kind and slug beside it compose "skill:lint"',
      },
    ]);
  });

  it('if shadowed candidates ascend rather than descend in precedence, locates the one out of order', () => {
    const catalog = buildCatalog();
    requireEntry(catalog.entries, 2).resolution.shadowed = [
      { sourceId: 'library', path: 'skills/review/SKILL.md', hash: 'hash:review-library' },
      { sourceId: 'team', path: 'skills/review/SKILL.md', hash: 'hash:review-team' },
    ];

    expect(findViolations(catalog)).toStrictEqual([
      {
        path: 'entries[2].resolution.shadowed[1].sourceId',
        message: 'names "team", which does not follow "library" in source precedence order',
      },
    ]);
  });

  it('if a shadowed candidate outranks the winner, locates it against the winner', () => {
    const catalog = buildCatalog();
    requireEntry(catalog.entries, 1).resolution.shadowed = [
      { sourceId: 'local', path: 'skills/lint/SKILL.md', hash: 'hash:lint-local' },
    ];

    expect(findViolations(catalog)).toStrictEqual([
      {
        path: 'entries[1].resolution.shadowed[0].sourceId',
        message: 'names "local", which does not follow "library" in source precedence order',
      },
    ]);
  });

  it('if one source appears twice among an entry candidates, names the repeat', () => {
    const catalog = buildCatalog();
    requireEntry(catalog.entries, 2).resolution.shadowed = [
      { sourceId: 'local', path: 'skills/review/SKILL.md', hash: 'hash:review-again' },
    ];

    expect(findViolations(catalog)).toContainEqual({
      path: 'entries[2].resolution.shadowed[0].sourceId',
      message: 'repeats "local", which already carries this artifact',
    });
  });

  it('collects every violation before throwing, rather than stopping at the first', () => {
    const catalog = buildCatalog();
    // Three independent breaks, one per check: a change to `kindId` alone would also move the composed id and report
    // twice, which would leave this asserting on a cascade rather than on collection.
    requireEntry(catalog.entries, 0).resolution.winner.sourceId = 'vendor';
    requireEntry(catalog.entries, 1).id = 'lint';
    requireEntry(catalog.entries, 2).resolution.shadowed = [
      { sourceId: 'library', path: 'skills/review/SKILL.md', hash: 'hash:review-library' },
      { sourceId: 'team', path: 'skills/review/SKILL.md', hash: 'hash:review-team' },
    ];

    expect(findViolations(catalog)).toHaveLength(3);
  });
});

/** The violations `catalog` raises, failing the test when it is consistent. */
function findViolations(catalog: Catalog): ReadonlyArray<CatalogViolation> {
  try {
    assertCatalogIsConsistent(catalog);
  } catch (error: unknown) {
    if (error instanceof CatalogConsistencyError) {
      return error.violations;
    }
    throw error;
  }
  throw new Error('Expected the catalog to be inconsistent, but it passed every check.');
}
