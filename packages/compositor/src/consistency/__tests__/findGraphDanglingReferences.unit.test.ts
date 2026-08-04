import { describe, expect, it } from 'vitest';

import { buildClosure } from '../../test-utils/buildClosure.ts';
import { buildPlan } from '../../test-utils/buildPlan.ts';
import { requireEntry } from '../../test-utils/requireEntry.ts';
import { findGraphDanglingReferences } from '../findGraphDanglingReferences.ts';

describe(findGraphDanglingReferences, () => {
  it('accepts a plan whose artifact and partial references all resolve', () => {
    expect(findGraphDanglingReferences(buildPlan())).toStrictEqual([]);
  });

  it('accepts a closure, which satisfies the same view without an adapter', () => {
    expect(findGraphDanglingReferences(buildClosure())).toStrictEqual([]);
  });

  it('if an artifact names a kind no table carries, locates the dangling reference', () => {
    const closure = buildClosure();
    closure.kinds = closure.kinds.filter((kind) => kind.id !== 'collection');

    expect(findGraphDanglingReferences(closure)).toStrictEqual([
      { path: 'artifacts[0].kindId', message: 'references "collection", which is not an entry in kinds' },
    ]);
  });

  it('if an edge names an unknown partial, locates the dangling reference', () => {
    const closure = buildClosure();
    closure.partials = [];

    expect(findGraphDanglingReferences(closure)).toStrictEqual([
      {
        path: 'artifacts[2].dependsOn[0].partialId',
        message: 'references "team:_data/shared.md", which is not an entry in partials',
      },
    ]);
  });

  it('if a partial names an unknown source, locates the dangling reference', () => {
    const closure = buildClosure();
    requireEntry(closure.partials, 0).sourceId = 'absent';

    expect(findGraphDanglingReferences(closure)).toStrictEqual([
      { path: 'partials[0].sourceId', message: 'references "absent", which is not an entry in sources' },
    ]);
  });

  it('tolerates a removed artifact, which is seeded by nothing and carries no seeds to check', () => {
    const plan = buildPlan();
    const retired = requireEntry(plan.artifacts, 2);
    plan.artifacts = [
      ...plan.artifacts.filter((artifact) => artifact !== retired),
      { id: retired.id, kindId: 'skill', slug: 'lint', status: 'removed' },
    ];

    expect(findGraphDanglingReferences(plan)).toStrictEqual([]);
  });
});
