import { describe, expect, it } from 'vitest';

import { ConsistencyError } from '../../consistency/ConsistencyError.ts';
import type { Plan } from '../../schemas/plan-schema.ts';
import { buildPlan } from '../../test-utils/buildPlan.ts';
import { requireEntry } from '../../test-utils/requireEntry.ts';
import { assertPlanIsConsistent, PlanConsistencyError } from '../assertPlanIsConsistent.ts';

// Each check is covered against its own module under `checks/__tests__/`. What is left here is what only the
// composition can show: that a check is wired in at all, that the checks do not interfere, and that one run reports
// every violation it found.
describe(assertPlanIsConsistent, () => {
  it('accepts a plan whose references, blobs, and statuses all agree', () => {
    expect(() => {
      assertPlanIsConsistent(buildPlan());
    }).not.toThrow();
  });

  it('if the tier table carries one id twice, names the repeated id', () => {
    const plan = buildPlan();
    plan.tiers = [...plan.tiers, { id: 'project', label: 'Project, again' }];

    expect(captureFailure(plan).violations).toStrictEqual([
      { path: 'tiers', message: 'carries "project" more than once' },
    ]);
  });

  it('if a shadowed candidate outranks its winner, rejects the resolution order', () => {
    const plan = buildPlan();
    // `team` outranks `library`, so a resolution won by `library` cannot shadow `team`.
    requireEntry(plan.artifacts, 2).resolution = {
      winner: { sourceId: 'library', path: 'skills/lint/SKILL.md', hash: 'hash:lint' },
      shadowed: [{ sourceId: 'team', path: 'skills/lint/SKILL.md', hash: 'hash:lint-team' }],
    };

    expect(captureFailure(plan).violations).toStrictEqual([
      {
        path: 'artifacts[2].resolution.shadowed[0].sourceId',
        message: 'names "team", which does not follow "library" in source precedence order',
      },
    ]);
  });

  it('if a shadowed candidate names an unknown source, reports only the dangling reference', () => {
    const plan = buildPlan();
    requireEntry(plan.artifacts, 1).resolution = {
      winner: { sourceId: 'team', path: 'skills/review/SKILL.md', hash: 'hash:review' },
      shadowed: [{ sourceId: 'absent', path: 'skills/review/SKILL.md', hash: 'hash:review-absent' }],
    };

    expect(captureFailure(plan).violations).toStrictEqual([
      {
        path: 'artifacts[1].resolution.shadowed[0].sourceId',
        message: 'references "absent", which is not an entry in sources',
      },
    ]);
  });

  it('reports every violation in one throw', () => {
    const plan = buildPlan();
    requireEntry(plan.files, 0).targetId = 'absent';
    requireEntry(plan.files, 0).planned = { hash: 'hash:review-current' };
    plan.blobs = {};

    expect(captureFailure(plan).violations).toHaveLength(4);
  });

  it('raises a failure a consumer can catch alongside a catalog failure, under its own name', () => {
    const plan = buildPlan();
    plan.tiers = [];
    const failure = captureFailure(plan);

    expect(failure).toBeInstanceOf(ConsistencyError);
    expect(failure.name).toBe('PlanConsistencyError');
    expect(failure.message).toMatch(/^Plan is inconsistent:\n/);
  });
});

// region | Helpers

/** Captures the failure `plan` raises, failing the test when it passes every check. */
function captureFailure(plan: Plan): PlanConsistencyError {
  try {
    assertPlanIsConsistent(plan);
  } catch (error: unknown) {
    if (error instanceof PlanConsistencyError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected the plan to be inconsistent, but it passed every check.');
}

// endregion | Helpers
