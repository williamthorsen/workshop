import { describe, expect, it } from 'vitest';

import { buildPlan } from '../../../test-utils/buildPlan.ts';
import { requireEntry } from '../../../test-utils/requireEntry.ts';
import { findStatusDisagreements } from '../findStatusDisagreements.ts';

describe(findStatusDisagreements, () => {
  it('accepts a file whose recorded status agrees with the sides it has', () => {
    expect(findStatusDisagreements(buildPlan())).toStrictEqual([]);
  });

  it('if both sides have the same hash, rejects a status of changed', () => {
    const plan = buildPlan();
    requireEntry(plan.files, 0).planned = { hash: 'hash:review-current' };

    expect(findStatusDisagreements(plan)).toStrictEqual([
      { path: 'files[0].status', message: 'is "changed", but its sides describe "unchanged"' },
    ]);
  });

  it('if a file has neither side, rejects it', () => {
    const plan = buildPlan();
    delete requireEntry(plan.files, 0).current;
    delete requireEntry(plan.files, 0).planned;

    expect(findStatusDisagreements(plan)).toStrictEqual([
      { path: 'files[0]', message: 'has neither a current nor a planned side' },
    ]);
  });

  it('accepts a block on an unchanged file, which is a destination whose content could not be computed', () => {
    const plan = buildPlan();
    requireEntry(plan.files, 0).status = 'unchanged';
    requireEntry(plan.files, 0).planned = { hash: 'hash:review-current' };
    requireEntry(plan.files, 0).blocked = { reason: 'the region host is malformed' };

    expect(findStatusDisagreements(plan)).toStrictEqual([]);
  });
});
