import { describe, expect, it } from 'vitest';

import { assertPlanIsConsistent, PlanConsistencyError, type PlanViolation } from '../assertPlanIsConsistent.ts';
import type { Plan } from '../schemas/planSchema.ts';
import { buildPlan } from '../test-utils/buildPlan.ts';
import { requireEntry } from '../test-utils/requireEntry.ts';

describe(assertPlanIsConsistent, () => {
  it('accepts a plan whose references, blobs, and statuses all agree', () => {
    expect(() => {
      assertPlanIsConsistent(buildPlan());
    }).not.toThrow();
  });

  it('if an edge names an artifact no table carries, locates the dangling reference', () => {
    const plan = buildPlan();
    requireEntry(plan.artifacts, 1).dependsOn = [{ to: 'skill:absent', via: 'declared' }];

    expect(findViolations(plan)).toStrictEqual([
      {
        path: 'artifacts[1].dependsOn[0].to',
        message: 'references "skill:absent", which is not an entry in artifacts',
      },
    ]);
  });

  it('if a file contributor names an unknown partial, locates the dangling reference', () => {
    const plan = buildPlan();
    requireEntry(plan.files, 0).contributors.partials = ['team:_data/absent.md'];

    expect(findViolations(plan)).toStrictEqual([
      {
        path: 'files[0].contributors.partials[0]',
        message: 'references "team:_data/absent.md", which is not an entry in partials',
      },
    ]);
  });

  it('if a table carries one id twice, names the repeated id', () => {
    const plan = buildPlan();
    plan.sources = [...plan.sources, { id: 'team', name: 'team-again', origin: { kind: 'directory', location: '/x' } }];

    expect(findViolations(plan)).toStrictEqual([{ path: 'sources', message: 'carries "team" more than once' }]);
  });

  it('if a non-token edge names a partial, rejects the edge it could not have been read from', () => {
    const plan = buildPlan();
    requireEntry(plan.artifacts, 0).dependsOn = [
      { to: 'skill:review', via: 'member', partialId: 'team:_data/shared.md' },
    ];

    expect(findViolations(plan)).toStrictEqual([
      {
        path: 'artifacts[0].dependsOn[0].partialId',
        message: 'is set on a "member" edge, and only a token edge is read from a partial',
      },
    ]);
  });

  it('if a plan claiming complete content omits a referenced body, names the missing hash', () => {
    const plan = buildPlan();
    plan.blobs = {};

    expect(findViolations(plan)).toStrictEqual([
      { path: 'files[0].current.hash', message: 'names "hash:review-current", which blobs does not carry' },
      { path: 'files[0].planned.hash', message: 'names "hash:review-planned", which blobs does not carry' },
    ]);
  });

  it('if a plan declares partial content, tolerates a body it does not carry', () => {
    const plan = buildPlan();
    plan.contentAvailability = 'partial';
    plan.blobs = {};

    expect(() => {
      assertPlanIsConsistent(plan);
    }).not.toThrow();
  });

  it('if both sides carry the same hash, rejects a status of changed', () => {
    const plan = buildPlan();
    requireEntry(plan.files, 0).planned = { hash: 'hash:review-current' };

    expect(findViolations(plan)).toStrictEqual([
      { path: 'files[0].status', message: 'is "changed", but its sides describe "unchanged"' },
    ]);
  });

  it('if a file carries neither side, rejects it', () => {
    const plan = buildPlan();
    delete requireEntry(plan.files, 0).current;
    delete requireEntry(plan.files, 0).planned;

    expect(findViolations(plan)).toStrictEqual([
      { path: 'files[0]', message: 'carries neither a current nor a planned side' },
    ]);
  });

  it('if an unchanged file records a block, rejects the block that could not apply anyway', () => {
    const plan = buildPlan();
    requireEntry(plan.files, 0).status = 'unchanged';
    requireEntry(plan.files, 0).planned = { hash: 'hash:review-current' };
    requireEntry(plan.files, 0).blocked = { reason: 'the region host is malformed' };

    expect(findViolations(plan)).toStrictEqual([
      { path: 'files[0].blocked', message: 'is set on a file that would not be written anyway' },
    ]);
  });

  it('reports every violation in one throw', () => {
    const plan = buildPlan();
    requireEntry(plan.files, 0).targetId = 'absent';
    requireEntry(plan.files, 0).planned = { hash: 'hash:review-current' };
    plan.blobs = {};

    expect(findViolations(plan)).toHaveLength(4);
  });
});

/** The violations `plan` raises, failing the test when it is consistent. */
function findViolations(plan: Plan): ReadonlyArray<PlanViolation> {
  try {
    assertPlanIsConsistent(plan);
  } catch (error: unknown) {
    if (error instanceof PlanConsistencyError) {
      return error.violations;
    }
    throw error;
  }
  throw new Error('Expected the plan to be inconsistent, but it passed every check.');
}
