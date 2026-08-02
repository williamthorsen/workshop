import { describe, expect, it } from 'vitest';

import type { Plan } from '../../schemas/plan-schema.ts';
import { buildPlan } from '../../test-utils/buildPlan.ts';
import { requireEntry } from '../../test-utils/requireEntry.ts';
import { assertPlanIsConsistent, PlanConsistencyError, type PlanViolation } from '../assertPlanIsConsistent.ts';

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

  it('if two file entries claim one destination, names the repeated path', () => {
    const plan = buildPlan();
    plan.files = [...plan.files, { ...requireEntry(plan.files, 0) }];

    expect(findViolations(plan)).toStrictEqual([
      { path: 'files[1]', message: 'repeats the destination "skills/review/SKILL.md" within target "claude"' },
    ]);
  });

  it('tolerates one path claimed once per target', () => {
    const plan = buildPlan();
    plan.targets = [
      ...plan.targets,
      { id: 'rovodev', label: 'Rovo Dev', root: '~/.rovodev', tokenMappings: [], variables: [] },
    ];
    plan.files = [...plan.files, { ...requireEntry(plan.files, 0), targetId: 'rovodev' }];

    expect(() => {
      assertPlanIsConsistent(plan);
    }).not.toThrow();
  });

  it('if a shadowed candidate outranks its winner, rejects the resolution order', () => {
    const plan = buildPlan();
    // `team` outranks `library`, so a resolution won by `library` cannot shadow `team`.
    requireEntry(plan.artifacts, 2).resolution = {
      winner: { sourceId: 'library', path: 'skills/lint/SKILL.md', hash: 'hash:lint' },
      shadowed: [{ sourceId: 'team', path: 'skills/lint/SKILL.md', hash: 'hash:lint-team' }],
    };

    expect(findViolations(plan)).toStrictEqual([
      {
        path: 'artifacts[2].resolution.shadowed[0].sourceId',
        message: 'names "team", which does not follow "library" in source precedence order',
      },
    ]);
  });

  it('if shadowed candidates run against precedence, rejects the one out of order', () => {
    const plan = buildPlan();
    plan.sources = [
      ...plan.sources,
      { id: 'packaged', name: 'packaged', origin: { kind: 'package', location: '@acme/guidance' } },
    ];
    const review = requireEntry(plan.artifacts, 1);
    review.resolution = {
      winner: { sourceId: 'team', path: 'skills/review/SKILL.md', hash: 'hash:review' },
      shadowed: [
        { sourceId: 'packaged', path: 'skills/review/SKILL.md', hash: 'hash:review-packaged' },
        { sourceId: 'library', path: 'skills/review/SKILL.md', hash: 'hash:review-library' },
      ],
    };

    expect(findViolations(plan)).toStrictEqual([
      {
        path: 'artifacts[1].resolution.shadowed[1].sourceId',
        message: 'names "library", which does not follow "packaged" in source precedence order',
      },
    ]);
  });

  it('if a shadowed candidate names an unknown source, reports only the dangling reference', () => {
    const plan = buildPlan();
    requireEntry(plan.artifacts, 1).resolution = {
      winner: { sourceId: 'team', path: 'skills/review/SKILL.md', hash: 'hash:review' },
      shadowed: [{ sourceId: 'absent', path: 'skills/review/SKILL.md', hash: 'hash:review-absent' }],
    };

    expect(findViolations(plan)).toStrictEqual([
      {
        path: 'artifacts[1].resolution.shadowed[0].sourceId',
        message: 'references "absent", which is not an entry in sources',
      },
    ]);
  });

  it('tolerates a removed artifact that no longer resolves from any source', () => {
    const plan = buildPlan();
    const retired = requireEntry(plan.artifacts, 2);
    plan.artifacts = [...plan.artifacts, { id: retired.id, kindId: 'skill', slug: 'lint', status: 'removed' }];
    plan.artifacts = plan.artifacts.filter((artifact) => artifact !== retired);

    expect(() => {
      assertPlanIsConsistent(plan);
    }).not.toThrow();
  });

  it('blames each out-of-order candidate on the source it was compared against', () => {
    const plan = buildPlan();
    plan.sources = [
      ...plan.sources,
      { id: 'packaged', name: 'packaged', origin: { kind: 'package', location: '@acme/guidance' } },
      { id: 'vendored', name: 'vendored', origin: { kind: 'directory', location: '/srv/vendored' } },
    ];
    // `vendored` is lowest, so both candidates after it are out of order against it, not against each other.
    requireEntry(plan.artifacts, 1).resolution = {
      winner: { sourceId: 'team', path: 'skills/review/SKILL.md', hash: 'hash:review' },
      shadowed: [
        { sourceId: 'vendored', path: 'skills/review/SKILL.md', hash: 'hash:review-vendored' },
        { sourceId: 'packaged', path: 'skills/review/SKILL.md', hash: 'hash:review-packaged' },
        { sourceId: 'library', path: 'skills/review/SKILL.md', hash: 'hash:review-library' },
      ],
    };

    expect(findViolations(plan)).toStrictEqual([
      {
        path: 'artifacts[1].resolution.shadowed[1].sourceId',
        message: 'names "packaged", which does not follow "vendored" in source precedence order',
      },
      {
        path: 'artifacts[1].resolution.shadowed[2].sourceId',
        message: 'names "library", which does not follow "vendored" in source precedence order',
      },
    ]);
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
