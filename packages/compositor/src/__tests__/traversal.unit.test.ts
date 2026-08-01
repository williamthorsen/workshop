import { describe, expect, it } from 'vitest';

import type { Plan } from '../schemas/planSchema.ts';
import { buildPlan } from '../test-utils/buildPlan.ts';
import { requireEntry } from '../test-utils/requireEntry.ts';
import { buildTraversalIndex, resolveInclusionPaths } from '../traversal.ts';

describe(resolveInclusionPaths, () => {
  it('returns one path per route when an artifact is reached two ways', () => {
    const plan = buildDiamond();

    expect(resolveInclusionPaths(plan, 'skill:lint')).toStrictEqual([
      ['collection:core', 'skill:review', 'skill:lint'],
      ['collection:core', 'skill:lint'],
    ]);
  });

  it("orders paths by the plan's own edge order, so the same plan always answers the same way", () => {
    const plan = buildDiamond();

    expect(resolveInclusionPaths(plan, 'skill:lint')).toStrictEqual(
      resolveInclusionPaths(buildDiamond(), 'skill:lint'),
    );
  });

  it('returns a single one-element path for a seeded artifact', () => {
    expect(resolveInclusionPaths(buildPlan(), 'collection:core')).toStrictEqual([['collection:core']]);
  });

  it('returns no path for an artifact nothing reaches', () => {
    const plan = buildPlan();
    requireEntry(plan.artifacts, 0).dependsOn = [];

    expect(resolveInclusionPaths(plan, 'skill:review')).toStrictEqual([]);
  });

  it('traverses an edge a token contributed through a partial', () => {
    expect(resolveInclusionPaths(buildPlan(), 'skill:lint')).toStrictEqual([
      ['collection:core', 'skill:review', 'skill:lint'],
    ]);
  });

  it('terminates on a plan whose edges form a cycle', () => {
    const plan = buildPlan();
    requireEntry(plan.artifacts, 2).dependsOn = [{ to: 'skill:review', via: 'declared' }];

    expect(resolveInclusionPaths(plan, 'skill:lint')).toStrictEqual([
      ['collection:core', 'skill:review', 'skill:lint'],
    ]);
  });
});

describe(buildTraversalIndex, () => {
  it('names the artifact whose token edge reached a dependency', () => {
    const index = buildTraversalIndex(buildPlan());

    expect(index.findDependents('skill:lint')).toStrictEqual(['skill:review']);
  });

  it('returns every file an artifact contributes content to', () => {
    const index = buildTraversalIndex(buildPlan());

    expect(index.findContributedFiles('skill:review').map((file) => file.path)).toStrictEqual([
      'skills/review/SKILL.md',
    ]);
  });

  it('returns each dependent once per edge that reaches the artifact', () => {
    const index = buildTraversalIndex(buildDiamond());

    expect(index.findDependents('skill:lint')).toStrictEqual(['collection:core', 'skill:review']);
  });

  it('returns nothing for an artifact no edge and no file reaches', () => {
    const index = buildTraversalIndex(buildPlan());

    expect(index.findDependents('collection:core')).toStrictEqual([]);
    expect(index.findContributedFiles('collection:core')).toStrictEqual([]);
  });
});

/** The fixture plan with a second route to `skill:lint`, so one artifact is reached by two paths. */
function buildDiamond(): Plan {
  const plan = buildPlan();
  const core = requireEntry(plan.artifacts, 0);
  core.dependsOn = [...(core.dependsOn ?? []), { to: 'skill:lint', via: 'member' }];
  return plan;
}
