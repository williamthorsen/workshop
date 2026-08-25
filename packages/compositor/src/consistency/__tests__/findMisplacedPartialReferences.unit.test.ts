import { describe, expect, it } from 'vitest';

import { buildPlan } from '../../test-utils/buildPlan.ts';
import { requireEntry } from '../../test-utils/requireEntry.ts';
import { findMisplacedPartialReferences } from '../findMisplacedPartialReferences.ts';

describe(findMisplacedPartialReferences, () => {
  it('accepts a token edge naming the partial it was read from', () => {
    expect(findMisplacedPartialReferences(buildPlan())).toStrictEqual([]);
  });

  it('tolerates an artifact that has no edges, which a removed one never does', () => {
    const plan = buildPlan();
    plan.artifacts = [...plan.artifacts, { id: 'skill:gone', kindId: 'skill', slug: 'gone', status: 'removed' }];

    expect(findMisplacedPartialReferences(plan)).toStrictEqual([]);
  });

  it('if a non-token edge names a partial, rejects the edge it could not have been read from', () => {
    const plan = buildPlan();
    requireEntry(plan.artifacts, 0).dependsOn = [
      { to: 'skill:review', via: 'member', partialId: 'team:_data/shared.md' },
    ];

    expect(findMisplacedPartialReferences(plan)).toStrictEqual([
      {
        path: 'artifacts[0].dependsOn[0].partialId',
        message: 'is set on a "member" edge, and only a token edge is read from a partial',
      },
    ]);
  });
});
