import { describe, expect, it } from 'vitest';

import { buildPlan } from '../../test-utils/buildPlan.ts';
import { buildTraversalIndex } from '../buildTraversalIndex.ts';

describe(buildTraversalIndex, () => {
  it('returns every file an artifact contributes content to', () => {
    const index = buildTraversalIndex(buildPlan());

    expect(index.findContributedFiles('skill:review').map((file) => file.path)).toStrictEqual([
      'skills/review/SKILL.md',
    ]);
  });

  it('returns nothing for an artifact no file reaches', () => {
    const index = buildTraversalIndex(buildPlan());

    expect(index.findContributedFiles('collection:core')).toStrictEqual([]);
  });

  it('answers the artifact-to-artifact direction it composes from the shared index', () => {
    const index = buildTraversalIndex(buildPlan());

    expect(index.findDependents('skill:lint')).toStrictEqual(['skill:review']);
  });
});
