import { describe, expect, it } from 'vitest';

import { buildPlan } from '../../../test-utils/buildPlan.ts';
import { requireEntry } from '../../../test-utils/requireEntry.ts';
import { findDanglingReferences } from '../findDanglingReferences.ts';

describe(findDanglingReferences, () => {
  it('accepts a plan whose every reference resolves', () => {
    expect(findDanglingReferences(buildPlan())).toStrictEqual([]);
  });

  it('if an edge names an artifact no table carries, locates the dangling reference', () => {
    const plan = buildPlan();
    requireEntry(plan.artifacts, 1).dependsOn = [{ to: 'skill:absent', via: 'declared' }];

    expect(findDanglingReferences(plan)).toStrictEqual([
      {
        path: 'artifacts[1].dependsOn[0].to',
        message: 'references "skill:absent", which is not an entry in artifacts',
      },
    ]);
  });

  it('if a file contributor names an unknown partial, locates the dangling reference', () => {
    const plan = buildPlan();
    requireEntry(plan.files, 0).contributors.partials = ['team:_data/absent.md'];

    expect(findDanglingReferences(plan)).toStrictEqual([
      {
        path: 'files[0].contributors.partials[0]',
        message: 'references "team:_data/absent.md", which is not an entry in partials',
      },
    ]);
  });

  it('if a seed names a tier no table carries, locates the dangling reference', () => {
    const plan = buildPlan();
    plan.tiers = [];

    expect(findDanglingReferences(plan)).toStrictEqual([
      {
        path: 'artifacts[0].seededBy[0].tierId',
        message: 'references "project", which is not an entry in tiers',
      },
    ]);
  });

  it('if a shadowed candidate names an unknown source, locates the dangling reference', () => {
    const plan = buildPlan();
    requireEntry(plan.artifacts, 1).resolution = {
      winner: { sourceId: 'team', path: 'skills/review/SKILL.md', hash: 'hash:review' },
      shadowed: [{ sourceId: 'absent', path: 'skills/review/SKILL.md', hash: 'hash:review-absent' }],
    };

    expect(findDanglingReferences(plan)).toStrictEqual([
      {
        path: 'artifacts[1].resolution.shadowed[0].sourceId',
        message: 'references "absent", which is not an entry in sources',
      },
    ]);
  });

  it('tolerates a removed artifact, which is seeded by nothing and carries no seeds to check', () => {
    const plan = buildPlan();
    const retired = requireEntry(plan.artifacts, 2);
    plan.artifacts = [...plan.artifacts, { id: retired.id, kindId: 'skill', slug: 'lint', status: 'removed' }];
    plan.artifacts = plan.artifacts.filter((artifact) => artifact !== retired);

    expect(findDanglingReferences(plan)).toStrictEqual([]);
  });
});
