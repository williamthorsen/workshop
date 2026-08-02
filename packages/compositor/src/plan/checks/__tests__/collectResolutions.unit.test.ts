import { describe, expect, it } from 'vitest';

import { buildPlan } from '../../../test-utils/buildPlan.ts';
import { collectResolutions } from '../collectResolutions.ts';

describe(collectResolutions, () => {
  it('locates each resolution by its artifact index', () => {
    expect(collectResolutions(buildPlan()).map(({ basePath }) => basePath)).toStrictEqual([
      'artifacts[0].resolution',
      'artifacts[1].resolution',
      'artifacts[2].resolution',
    ]);
  });

  it('carries each resolution through untouched', () => {
    const plan = buildPlan();

    expect(collectResolutions(plan).map(({ resolution }) => resolution)).toStrictEqual(
      plan.artifacts.map((artifact) => artifact.resolution),
    );
  });

  it('if an artifact resolves from nothing, keeps its place so later paths still name the right artifact', () => {
    const plan = buildPlan();
    plan.artifacts = [{ id: 'skill:gone', kindId: 'skill', slug: 'gone', status: 'removed' }, ...plan.artifacts];

    expect(collectResolutions(plan).at(0)).toStrictEqual({
      basePath: 'artifacts[0].resolution',
      resolution: undefined,
    });
  });
});
