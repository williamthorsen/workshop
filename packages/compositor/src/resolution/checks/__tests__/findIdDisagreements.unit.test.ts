import { describe, expect, it } from 'vitest';

import { requireEntry } from '../../../test-utils/requireEntry.ts';
import { buildCatalog } from '../../test-utils/buildCatalog.ts';
import { findIdDisagreements } from '../findIdDisagreements.ts';

describe(findIdDisagreements, () => {
  it('accepts a catalog whose every entry id composes its kind and slug', () => {
    expect(findIdDisagreements(buildCatalog())).toStrictEqual([]);
  });

  it('if an entry id does not compose its kind and slug, reports what the pair composes', () => {
    const catalog = buildCatalog();
    requireEntry(catalog.entries, 1).id = 'lint';

    expect(findIdDisagreements(catalog)).toStrictEqual([
      {
        path: 'entries[1].id',
        message: 'is "lint", and the kind and slug beside it compose "skill:lint"',
      },
    ]);
  });
});
