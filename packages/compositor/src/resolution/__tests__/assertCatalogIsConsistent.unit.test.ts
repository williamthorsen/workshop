import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { ConsistencyError } from '../../consistency/ConsistencyError.ts';
import { CatalogSchema } from '../../schemas/catalog-schemas.ts';
import { requireEntry } from '../../test-utils/requireEntry.ts';
import { assertCatalogIsConsistent, CatalogConsistencyError } from '../assertCatalogIsConsistent.ts';
import { buildCatalog } from '../test-utils/buildCatalog.ts';

// Each check is covered against its own module under `checks/__tests__/`. What is left here is what only the
// composition can show: that a check is wired in at all, and that one run reports every violation it found.
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

  it('if a table carries one id twice, names the repeated id', async () => {
    const catalog = buildCatalog();
    catalog.sources = [...catalog.sources, { ...requireEntry(catalog.sources, 0), name: 'local-again' }];

    const failure = await captureError(CatalogConsistencyError, () => assertCatalogIsConsistent(catalog));

    expect(failure.violations).toStrictEqual([{ path: 'sources', message: 'lists "local" more than once' }]);
  });

  it('if shadowed candidates ascend rather than descend in precedence, locates the one out of order', async () => {
    const catalog = buildCatalog();
    requireEntry(catalog.entries, 2).resolution.shadowed = [
      { sourceId: 'library', path: 'skills/review/SKILL.md', hash: 'hash:review-library' },
      { sourceId: 'team', path: 'skills/review/SKILL.md', hash: 'hash:review-team' },
    ];

    const failure = await captureError(CatalogConsistencyError, () => assertCatalogIsConsistent(catalog));

    expect(failure.violations).toStrictEqual([
      {
        path: 'entries[2].resolution.shadowed[1].sourceId',
        message: 'names "team", which does not follow "library" in source precedence order',
      },
    ]);
  });

  it('if one source appears twice among an entry candidates, names the repeat', async () => {
    const catalog = buildCatalog();
    requireEntry(catalog.entries, 2).resolution.shadowed = [
      { sourceId: 'local', path: 'skills/review/SKILL.md', hash: 'hash:review-again' },
    ];

    const failure = await captureError(CatalogConsistencyError, () => assertCatalogIsConsistent(catalog));

    expect(failure.violations).toContainEqual({
      path: 'entries[2].resolution.shadowed[0].sourceId',
      message: 'repeats "local", which already contains this artifact',
    });
  });

  it('collects every violation before throwing, rather than stopping at the first', async () => {
    const catalog = buildCatalog();
    // Three independent breaks, one per check: a change to `kindId` alone would also move the composed id and report
    // twice, which would leave this asserting on a cascade rather than on collection.
    requireEntry(catalog.entries, 0).resolution.winner.sourceId = 'vendor';
    requireEntry(catalog.entries, 1).id = 'lint';
    requireEntry(catalog.entries, 2).resolution.shadowed = [
      { sourceId: 'library', path: 'skills/review/SKILL.md', hash: 'hash:review-library' },
      { sourceId: 'team', path: 'skills/review/SKILL.md', hash: 'hash:review-team' },
    ];

    const failure = await captureError(CatalogConsistencyError, () => assertCatalogIsConsistent(catalog));

    expect(failure.violations).toHaveLength(3);
  });

  it('raises a failure a consumer can catch alongside a plan failure, under its own name', async () => {
    const catalog = buildCatalog();
    requireEntry(catalog.entries, 1).id = 'lint';
    const failure = await captureError(CatalogConsistencyError, () => assertCatalogIsConsistent(catalog));

    expect(failure).toBeInstanceOf(ConsistencyError);
    expect(failure.name).toBe('CatalogConsistencyError');
    expect(failure.message).toMatch(/^Catalog is inconsistent:\n/);
  });
});
