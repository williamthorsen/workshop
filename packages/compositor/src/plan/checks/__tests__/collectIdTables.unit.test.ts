import { describe, expect, it } from 'vitest';

import { buildPlan } from '../../../test-utils/buildPlan.ts';
import { collectIdTables } from '../collectIdTables.ts';

describe(collectIdTables, () => {
  it('names every table an id reference can point at, in the order a violation is reported', () => {
    expect(collectIdTables(buildPlan()).map(([name]) => name)).toStrictEqual([
      'artifacts',
      'kinds',
      'partials',
      'sources',
      'targets',
      'tiers',
    ]);
  });

  it('pairs each name with the table it stands for, so a violation names where the repeat is', () => {
    const plan = buildPlan();
    const tables = new Map(collectIdTables(plan));

    expect(tables.get('partials')).toStrictEqual(plan.partials);
    expect(tables.get('tiers')).toStrictEqual(plan.tiers);
  });
});
