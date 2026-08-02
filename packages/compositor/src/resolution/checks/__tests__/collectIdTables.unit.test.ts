import { describe, expect, it } from 'vitest';

import { buildCatalog } from '../../test-utils/buildCatalog.ts';
import { collectIdTables } from '../collectIdTables.ts';

describe(collectIdTables, () => {
  it('names every table an id reference can point at, in the order a violation is reported', () => {
    expect(collectIdTables(buildCatalog()).map(([name]) => name)).toStrictEqual(['entries', 'kinds', 'sources']);
  });

  it('pairs each name with the table it stands for, so a violation names where the repeat is', () => {
    const catalog = buildCatalog();
    const tables = new Map(collectIdTables(catalog));

    expect(tables.get('entries')).toStrictEqual(catalog.entries);
    expect(tables.get('sources')).toStrictEqual(catalog.sources);
  });
});
