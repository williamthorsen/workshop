import { describe, expect, it } from 'vitest';

import type { Plan } from '../../schemas/plan-schema.ts';
import { buildPlan } from '../../test-utils/buildPlan.ts';
import { requireEntry } from '../../test-utils/requireEntry.ts';
import { buildDependentsIndex, type DependencyGraphView, resolveInclusionPaths } from '../traversal.ts';

describe(resolveInclusionPaths, () => {
  it('returns one path per route when an artifact is reached two ways', () => {
    const plan = buildDiamond();

    expect(resolveInclusionPaths(plan, 'skill:lint')).toStrictEqual([
      ['collection:core', 'skill:review', 'skill:lint'],
      ['collection:core', 'skill:lint'],
    ]);
  });

  it("orders paths by the document's own edge order, so the same document always answers the same way", () => {
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

  it('terminates on a document whose edges form a cycle', () => {
    const plan = buildPlan();
    requireEntry(plan.artifacts, 2).dependsOn = [{ to: 'skill:review', via: 'declared' }];

    // Searching for an artifact the cycle does not reach forces the walk through the back edge rather than stopping at
    // the target, which is the only way the guard is exercised.
    expect(resolveInclusionPaths(plan, 'skill:absent')).toStrictEqual([]);
  });

  it('still finds the paths that exist on a document whose edges form a cycle', () => {
    const plan = buildPlan();
    requireEntry(plan.artifacts, 2).dependsOn = [{ to: 'skill:review', via: 'declared' }];

    expect(resolveInclusionPaths(plan, 'skill:lint')).toStrictEqual([
      ['collection:core', 'skill:review', 'skill:lint'],
    ]);
  });

  it('resolves paths through a document carrying only ids, edges, and seeds', () => {
    expect(resolveInclusionPaths(buildClosureShaped(), 'skill:lint')).toStrictEqual([
      ['collection:core', 'skill:review', 'skill:lint'],
    ]);
  });

  it('starts no path at an artifact a document records as removed', () => {
    const plan = buildPlan();
    const core = requireEntry(plan.artifacts, 0);

    expect(resolveInclusionPaths({ artifacts: [{ ...core, status: 'removed' }] }, 'collection:core')).toStrictEqual([]);
  });
});

describe(buildDependentsIndex, () => {
  it('names the artifact whose token edge reached a dependency', () => {
    const findDependents = buildDependentsIndex(buildPlan());

    expect(findDependents('skill:lint')).toStrictEqual(['skill:review']);
  });

  it('returns each dependent once per edge that reaches the artifact', () => {
    const findDependents = buildDependentsIndex(buildDiamond());

    expect(findDependents('skill:lint')).toStrictEqual(['collection:core', 'skill:review']);
  });

  it('returns nothing for an artifact no edge reaches', () => {
    const findDependents = buildDependentsIndex(buildPlan());

    expect(findDependents('collection:core')).toStrictEqual([]);
  });

  it('indexes a document carrying only ids and edges', () => {
    const findDependents = buildDependentsIndex(buildClosureShaped());

    expect(findDependents('skill:review')).toStrictEqual(['collection:core']);
  });
});

// region | Helpers

/**
 * A graph carrying only what traversal reads, standing in for a closure before one exists.
 *
 * Nothing here is a plan: no status, no resolution, no kind. That is the point, because the helpers take this shape and
 * the closure ticket therefore adds no second copy of them.
 */
function buildClosureShaped(): DependencyGraphView {
  return {
    artifacts: [
      {
        id: 'collection:core',
        seededBy: [{ via: 'declaration', tierId: 'project' }],
        dependsOn: [{ to: 'skill:review', via: 'member' }],
      },
      { id: 'skill:review', seededBy: [], dependsOn: [{ to: 'skill:lint', via: 'declared' }] },
      { id: 'skill:lint', seededBy: [], dependsOn: [] },
    ],
  };
}

/** The fixture plan with a second route to `skill:lint`, so one artifact is reached by two paths. */
function buildDiamond(): Plan {
  const plan = buildPlan();
  const core = requireEntry(plan.artifacts, 0);
  core.dependsOn = [...(core.dependsOn ?? []), { to: 'skill:lint', via: 'member' }];
  return plan;
}

// endregion | Helpers
