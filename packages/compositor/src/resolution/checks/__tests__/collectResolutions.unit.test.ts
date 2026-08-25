import { describe, expect, it } from 'vitest';

import { buildCatalog } from '../../test-utils/buildCatalog.ts';
import { collectResolutions } from '../collectResolutions.ts';

describe(collectResolutions, () => {
  it('locates each resolution by its entry index', () => {
    expect(collectResolutions(buildCatalog()).map(({ basePath }) => basePath)).toStrictEqual([
      'entries[0].resolution',
      'entries[1].resolution',
      'entries[2].resolution',
    ]);
  });

  it('passes each resolution through untouched', () => {
    const catalog = buildCatalog();

    expect(collectResolutions(catalog).map(({ resolution }) => resolution)).toStrictEqual(
      catalog.entries.map((entry) => entry.resolution),
    );
  });
});
