import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { ConsistencyError } from '../../consistency/ConsistencyError.ts';
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

  it('if the tier table carries one id twice, names the repeated id', async () => {
    const plan = buildPlan();
    plan.tiers = [...plan.tiers, { id: 'project', label: 'Project, again' }];

    const failure = await captureError(PlanConsistencyError, () => assertPlanIsConsistent(plan));

    expect(failure.violations).toStrictEqual([{ path: 'tiers', message: 'lists "project" more than once' }]);
  });

  it('if two file entries claim one destination, names the repeated path', async () => {
    const plan = buildPlan();
    plan.files = [...plan.files, { ...requireEntry(plan.files, 0) }];

    const failure = await captureError(PlanConsistencyError, () => assertPlanIsConsistent(plan));

    expect(failure.violations).toStrictEqual([
      { path: 'files[1]', message: 'repeats the destination "skills/review/SKILL.md" within target "claude"' },
    ]);
  });

  it('if a non-token edge names a partial, rejects the edge', async () => {
    const plan = buildPlan();
    requireEntry(plan.artifacts, 0).dependsOn = [
      { to: 'skill:review', via: 'member', partialId: 'team:_data/shared.md' },
    ];

    const failure = await captureError(PlanConsistencyError, () => assertPlanIsConsistent(plan));

    expect(failure.violations).toStrictEqual([
      {
        path: 'artifacts[0].dependsOn[0].partialId',
        message: 'is set on a "member" edge, and only a token edge is read from a partial',
      },
    ]);
  });

  it('if a shadowed candidate outranks its winner, rejects the resolution order', async () => {
    const plan = buildPlan();
    // `team` outranks `library`, so a resolution won by `library` cannot shadow `team`.
    requireEntry(plan.artifacts, 2).resolution = {
      winner: { sourceId: 'library', path: 'skills/lint/SKILL.md', hash: 'hash:lint' },
      shadowed: [{ sourceId: 'team', path: 'skills/lint/SKILL.md', hash: 'hash:lint-team' }],
    };

    const failure = await captureError(PlanConsistencyError, () => assertPlanIsConsistent(plan));

    expect(failure.violations).toStrictEqual([
      {
        path: 'artifacts[2].resolution.shadowed[0].sourceId',
        message: 'names "team", which does not follow "library" in source precedence order',
      },
    ]);
  });

  it('if a shadowed candidate names an unknown source, reports only the dangling reference', async () => {
    const plan = buildPlan();
    requireEntry(plan.artifacts, 1).resolution = {
      winner: { sourceId: 'team', path: 'skills/review/SKILL.md', hash: 'hash:review' },
      shadowed: [{ sourceId: 'absent', path: 'skills/review/SKILL.md', hash: 'hash:review-absent' }],
    };

    const failure = await captureError(PlanConsistencyError, () => assertPlanIsConsistent(plan));

    expect(failure.violations).toStrictEqual([
      {
        path: 'artifacts[1].resolution.shadowed[0].sourceId',
        message: 'references "absent", which is not an entry in sources',
      },
    ]);
  });

  it('reports every violation in one throw', async () => {
    const plan = buildPlan();
    requireEntry(plan.files, 0).targetId = 'absent';
    requireEntry(plan.files, 0).planned = { hash: 'hash:review-current' };
    plan.blobs = {};

    const failure = await captureError(PlanConsistencyError, () => assertPlanIsConsistent(plan));

    expect(failure.violations).toHaveLength(4);
  });

  it('raises a failure a consumer can catch alongside a catalog failure, under its own name', async () => {
    const plan = buildPlan();
    plan.tiers = [];
    const failure = await captureError(PlanConsistencyError, () => assertPlanIsConsistent(plan));

    expect(failure).toBeInstanceOf(ConsistencyError);
    expect(failure.name).toBe('PlanConsistencyError');
    expect(failure.message).toMatch(/^Plan is inconsistent:\n/);
  });
});
