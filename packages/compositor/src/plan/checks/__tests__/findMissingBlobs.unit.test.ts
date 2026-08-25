import { describe, expect, it } from 'vitest';

import { buildPlan } from '../../../test-utils/buildPlan.ts';
import { findMissingBlobs } from '../findMissingBlobs.ts';

describe(findMissingBlobs, () => {
  it('accepts a plan containing every body it references', () => {
    expect(findMissingBlobs(buildPlan())).toStrictEqual([]);
  });

  it('if a plan claiming complete content omits a referenced body, names the missing hash on each side', () => {
    const plan = buildPlan();
    plan.blobs = {};

    expect(findMissingBlobs(plan)).toStrictEqual([
      { path: 'files[0].current.hash', message: 'names "hash:review-current", which blobs does not contain' },
      { path: 'files[0].planned.hash', message: 'names "hash:review-planned", which blobs does not contain' },
    ]);
  });

  it('if a plan declares partial content, tolerates a body it does not contain', () => {
    const plan = buildPlan();
    plan.contentAvailability = 'partial';
    plan.blobs = {};

    expect(findMissingBlobs(plan)).toStrictEqual([]);
  });
});
