import { describe, expect, it } from 'vitest';

import { buildPlan } from '../../test-utils/buildPlan.ts';
import { PLAN_SCHEMA_VERSION, PlanSchema } from '../plan-schemas.ts';
import { findIssuePaths } from '../test-utils/findIssuePaths.ts';

const tables = [
  'artifacts',
  'blobs',
  'files',
  'fingerprint',
  'kinds',
  'partials',
  'sources',
  'targets',
  'tiers',
] as const;

describe('PlanSchema', () => {
  it('accepts a plan carrying every table', () => {
    const plan = buildPlan();

    expect(PlanSchema.parse(plan)).toStrictEqual(plan);
  });

  it.each(tables)('if %s is absent, rejects the plan for that field', (table) => {
    const { [table]: _dropped, ...incomplete } = buildPlan();

    expect(findIssuePaths(PlanSchema, incomplete)).toStrictEqual([[table]]);
  });

  it('if content availability is outside the known set, rejects the plan for that field', () => {
    expect(findIssuePaths(PlanSchema, { ...buildPlan(), contentAvailability: 'lazy' })).toStrictEqual([
      ['contentAvailability'],
    ]);
  });

  it('carries no clock-derived field, so identical inputs yield an identical payload', () => {
    expect(PlanSchema.parse(buildPlan())).toStrictEqual(PlanSchema.parse(buildPlan()));
  });

  it('declares a positive schema version', () => {
    expect(PLAN_SCHEMA_VERSION).toBeGreaterThan(0);
  });
});
