import { describe, expect, it } from 'vitest';

import { buildPlan } from '../../test-utils/buildPlan.ts';
import * as catalogSchemas from '../catalogSchemas.ts';
import * as commonSchemas from '../common.ts';
import * as fileSchemas from '../fileSchemas.ts';
import * as graphSchemas from '../graphSchemas.ts';
import * as barrel from '../index.ts';
import * as planSchema from '../planSchema.ts';
import { PlanSchema, SCHEMA_VERSION } from '../planSchema.ts';
import { findIssuePaths } from '../test-utils/findIssuePaths.ts';

const tables = ['artifacts', 'blobs', 'files', 'fingerprint', 'kinds', 'partials', 'sources', 'targets'] as const;

const modules: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ['catalogSchemas', catalogSchemas],
  ['common', commonSchemas],
  ['fileSchemas', fileSchemas],
  ['graphSchemas', graphSchemas],
  ['planSchema', planSchema],
];

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
    expect(SCHEMA_VERSION).toBeGreaterThan(0);
  });
});

describe('schema barrel', () => {
  it.each(modules)('re-exports every runtime member of %s', (_label, module) => {
    const exported = new Set(Object.keys(barrel));
    const missing = Object.keys(module).filter((name) => !exported.has(name));

    expect(missing).toStrictEqual([]);
  });
});
