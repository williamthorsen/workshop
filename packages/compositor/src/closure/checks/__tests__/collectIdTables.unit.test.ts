import { describe, expect, it } from 'vitest';

import { buildClosure } from '../../../test-utils/buildClosure.ts';
import { collectIdTables } from '../collectIdTables.ts';

describe(collectIdTables, () => {
  it('collects every id-keyed table, so the duplicate check covers all of them', () => {
    expect(collectIdTables(buildClosure()).map(([name]) => name)).toStrictEqual([
      'artifacts',
      'kinds',
      'partials',
      'sources',
      'tiers',
    ]);
  });

  it('carries each table by reference, so a check reads the entries the closure holds', () => {
    const closure = buildClosure();
    const [, entries] = collectIdTables(closure)[0] ?? [];

    expect(entries).toBe(closure.artifacts);
  });
});
